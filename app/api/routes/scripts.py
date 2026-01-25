import json
import time
import tempfile
import shutil
from pathlib import Path

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
):
    """
    Analyze a screenplay PDF and extract location requirements.

    This endpoint streams results via Server-Sent Events (SSE) as each location
    is analyzed by the LLM workers in parallel.

    Events:
    - status: Progress updates
    - location: Each analyzed location requirement
    - complete: Final summary when done
    - error: Any errors that occur
    """

    async def event_generator():
        start_time = time.time()
        processed_count = 0

        try:
            # Validate file exists
            pdf_path = Path(file_path)
            if not pdf_path.exists():
                yield {
                    "event": "error",
                    "data": json.dumps({"error": f"File not found: {file_path}"}),
                }
                return

            if not pdf_path.suffix.lower() == ".pdf":
                yield {
                    "event": "error",
                    "data": json.dumps({"error": "File must be a PDF"}),
                }
                return

            # Extract text from PDF
            yield {
                "event": "status",
                "data": json.dumps({"message": "Extracting text from PDF..."}),
            }

            pages = extract_text_with_pages(pdf_path)
            logger.info("PDF extracted", pages=len(pages), file=file_path)

            yield {
                "event": "status",
                "data": json.dumps({
                    "message": f"Extracted {len(pages)} pages from PDF",
                    "pages": len(pages),
                }),
            }

            # Find unique locations
            yield {
                "event": "status",
                "data": json.dumps({"message": "Identifying scene locations..."}),
            }

            locations = extract_unique_locations(pages)
            initial_count = len(locations)
            logger.info("Locations identified", count=initial_count)

            yield {
                "event": "status",
                "data": json.dumps({
                    "message": f"Found {initial_count} locations, deduplicating...",
                    "total": initial_count,
                }),
            }

            # Deduplicate similar locations using LLM
            locations = await deduplicate_locations_with_llm(locations)
            total_locations = len(locations)

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

            async for location_req in process_locations_streaming(locations):
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
            logger.exception("Error during script analysis", error=str(e))
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }

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
