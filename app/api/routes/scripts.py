import json
import time
import tempfile
import shutil
from pathlib import Path
from urllib.parse import urlparse

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from sse_starlette.sse import EventSourceResponse

from app.services.pdf_parser import extract_text_with_pages
from app.services.scene_extractor import extract_unique_locations
from app.services.llm_worker import deduplicate_locations_with_llm, process_locations_streaming


logger = structlog.get_logger()
router = APIRouter(prefix="/api/scripts", tags=["scripts"])

# Store uploaded files temporarily
UPLOAD_DIR = Path(tempfile.gettempdir()) / "location-scout-uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/upload")
async def upload_script(file: UploadFile = File(...)):
    """
    Upload a screenplay PDF for analysis.
    Returns the temporary file path to use with /analyze.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    # Save to temp directory
    file_path = UPLOAD_DIR / f"{int(time.time())}_{file.filename}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    logger.info("File uploaded", filename=file.filename, path=str(file_path))

    return {
        "filename": file.filename,
        "path": str(file_path),
        "size": file_path.stat().st_size,
    }


@router.get("/analyze")
async def analyze_script(
    file_path: str = Query(..., description="Path to the PDF screenplay file"),
    project_id: str = Query(default="", description="Project ID to associate with extracted locations"),
    target_city: str = Query(default="Los Angeles, CA", description="Target city for location search"),
):
    """
    Analyze a screenplay PDF and extract location requirements.

    This endpoint streams results via Server-Sent Events (SSE) as each location
    is analyzed by the LLM workers in parallel.

    The output format is compatible with Stage 2's LocationRequirement input.

    Events:
    - status: Progress updates
    - location: Each analyzed location requirement (Stage 2 compatible)
    - complete: Final summary when done
    - error: Any errors that occur
    """
    print(f"[ANALYZE] Starting analysis for: {file_path}")
    logger.info("Starting analysis", file_path=file_path)

    async def event_generator():
        start_time = time.time()
        processed_count = 0
        temp_download_path = None

        try:
            # Check if file_path is a URL (Supabase signed URL) or local path
            parsed = urlparse(file_path)
            is_url = parsed.scheme in ("http", "https")

            if is_url:
                print(f"[ANALYZE] Detected URL, downloading: {file_path[:100]}...")
                yield {
                    "event": "status",
                    "data": json.dumps({"message": "Downloading script from storage..."}),
                }

                # Download the file
                try:
                    async with httpx.AsyncClient() as client:
                        response = await client.get(file_path, timeout=60.0)
                        response.raise_for_status()

                        # Save to temp file
                        temp_download_path = UPLOAD_DIR / f"download_{int(time.time())}.pdf"
                        with open(temp_download_path, "wb") as f:
                            f.write(response.content)
                        pdf_path = temp_download_path
                        print(f"[ANALYZE] Downloaded to: {pdf_path}")
                except Exception as e:
                    print(f"[ANALYZE] ERROR downloading: {e}")
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": f"Failed to download script: {str(e)}"}),
                    }
                    return
            else:
                # Local file path
                pdf_path = Path(file_path)
                print(f"[ANALYZE] Checking file: {pdf_path}, exists={pdf_path.exists()}")

                if not pdf_path.exists():
                    print(f"[ANALYZE] ERROR: File not found")
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": f"File not found: {file_path}"}),
                    }
                    return

            if not str(pdf_path).lower().endswith(".pdf"):
                print(f"[ANALYZE] ERROR: Not a PDF")
                yield {
                    "event": "error",
                    "data": json.dumps({"error": "File must be a PDF"}),
                }
                return

            # Extract text from PDF
            print("[ANALYZE] Extracting PDF text...")
            yield {
                "event": "status",
                "data": json.dumps({"message": "Extracting text from PDF..."}),
            }

            pages = extract_text_with_pages(pdf_path)
            print(f"[ANALYZE] PDF extracted: {len(pages)} pages")
            logger.info("PDF extracted", pages=len(pages), file=file_path)

            print(f"[ANALYZE] Yielding pages status: {len(pages)} pages")
            yield {
                "event": "status",
                "data": json.dumps({
                    "message": f"Extracted {len(pages)} pages from PDF",
                    "pages": len(pages),
                }),
            }

            # Find unique locations
            print("[ANALYZE] Finding unique locations...")
            yield {
                "event": "status",
                "data": json.dumps({"message": "Identifying scene locations..."}),
            }

            locations = extract_unique_locations(pages)
            initial_count = len(locations)
            print(f"[ANALYZE] Found {initial_count} locations")
            logger.info("Locations identified", count=initial_count)

            print(f"[ANALYZE] Yielding dedup status...")
            yield {
                "event": "status",
                "data": json.dumps({
                    "message": f"Found {initial_count} locations, deduplicating...",
                    "total": initial_count,
                }),
            }

            # Deduplicate similar locations using LLM
            print("[ANALYZE] Starting deduplication with LLM...")
            locations = await deduplicate_locations_with_llm(locations)
            total_locations = len(locations)
            print(f"[ANALYZE] After dedup: {total_locations} locations")

            if total_locations < initial_count:
                logger.info("Locations deduplicated", before=initial_count, after=total_locations)
                yield {
                    "event": "status",
                    "data": json.dumps({
                        "message": f"Merged to {total_locations} unique locations",
                        "total": total_locations,
                    }),
                }
            else:
                yield {
                    "event": "status",
                    "data": json.dumps({
                        "message": f"Found {total_locations} unique locations",
                        "total": total_locations,
                    }),
                }

            if total_locations == 0:
                yield {
                    "event": "complete",
                    "data": json.dumps({
                        "success": True,
                        "total_locations": 0,
                        "message": "No scene locations found in the script",
                        "processing_time_seconds": round(time.time() - start_time, 2),
                    }),
                }
                return

            # Process with LLM workers, streaming results
            yield {
                "event": "status",
                "data": json.dumps({
                    "message": "Analyzing locations with AI... (this may take a few minutes)",
                }),
            }

            async for location_req in process_locations_streaming(
                locations, project_id=project_id, target_city=target_city
            ):
                processed_count += 1

                yield {
                    "event": "location",
                    "data": location_req.model_dump_json(),
                }

                # Progress update every location
                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "processed": processed_count,
                        "total": total_locations,
                        "percent": round((processed_count / total_locations) * 100, 1),
                    }),
                }

            # Complete
            processing_time = round(time.time() - start_time, 2)
            logger.info(
                "Analysis complete",
                locations=processed_count,
                time_seconds=processing_time,
            )

            yield {
                "event": "complete",
                "data": json.dumps({
                    "success": True,
                    "total_locations": processed_count,
                    "processing_time_seconds": processing_time,
                }),
            }

        except Exception as e:
            print(f"[ANALYZE] ERROR: {e}")
            import traceback
            traceback.print_exc()
            logger.exception("Error during script analysis", error=str(e))
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }
        finally:
            # Clean up downloaded temp file
            if temp_download_path and temp_download_path.exists():
                try:
                    temp_download_path.unlink()
                    print(f"[ANALYZE] Cleaned up temp file: {temp_download_path}")
                except Exception as e:
                    print(f"[ANALYZE] Failed to clean up temp file: {e}")

    print("[ANALYZE] Returning EventSourceResponse")
    return EventSourceResponse(event_generator())


@router.get("/available")
async def list_available_scripts():
    """
    List PDF scripts available in the project directory.
    """
    # Look for PDFs in the project root
    project_root = Path(__file__).parent.parent.parent.parent
    scripts = []

    for pdf_file in project_root.glob("*.pdf"):
        scripts.append({
            "filename": pdf_file.name,
            "path": str(pdf_file.absolute()),
            "size": pdf_file.stat().st_size,
        })

    # Sort by filename
    scripts.sort(key=lambda x: x["filename"])

    return {"scripts": scripts}


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
