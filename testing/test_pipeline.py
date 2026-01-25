"""
End-to-end test: Stage 1 (Script Analysis) -> Stage 2 (Grounding & Discovery)

This script tests the full pipeline from screenplay PDF to location candidates.

Usage:
    # Test with a real PDF screenplay
    python -m testing.test_pipeline --pdf path/to/screenplay.pdf

    # Test with sample data (no PDF needed, uses mock Stage 1 output)
    python -m testing.test_pipeline --sample

    # Save results to Supabase
    python -m testing.test_pipeline --sample --save-db

Environment variables required:
    OPENAI_API_KEY=your-openai-key          (for Stage 1)
    GOOGLE_CLOUD_PROJECT=your-project-id    (for Stage 2)
    PERPLEXITY_API_KEY=pplx-your-key        (for Stage 2 visual verification)
    SUPABASE_URL=https://xxx.supabase.co    (optional, for --save-db)
    SUPABASE_SECRET_KEY=your-key            (optional, for --save-db)
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Load .env file
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

import os


def check_stage1_env() -> bool:
    """Check if Stage 1 environment is configured."""
    if not os.environ.get("OPENAI_API_KEY"):
        print("WARNING: OPENAI_API_KEY not set - Stage 1 will fail")
        return False
    return True


def check_stage2_env() -> bool:
    """Check if Stage 2 environment is configured."""
    if not os.environ.get("GOOGLE_CLOUD_PROJECT"):
        print("WARNING: GOOGLE_CLOUD_PROJECT not set - Stage 2 will fail")
        return False
    return True


async def run_stage1_from_pdf(
    pdf_path: Path,
    project_id: str,
    target_city: str,
    max_concurrent: int = 15,
) -> list:
    """
    Run Stage 1: Extract location requirements from a PDF screenplay.

    Returns list of LocationRequirement objects.
    """
    from app.services.pdf_parser import extract_text_with_pages
    from app.services.scene_extractor import extract_unique_locations
    from app.services.llm_worker import deduplicate_locations_with_llm, process_locations_streaming

    print("\n" + "=" * 60)
    print("STAGE 1: SCRIPT ANALYSIS")
    print("=" * 60)

    # Extract text from PDF
    print(f"\nExtracting text from: {pdf_path}")
    pages = extract_text_with_pages(pdf_path)
    print(f"  Extracted {len(pages)} pages")

    # Find unique locations
    print("\nIdentifying scene locations...")
    locations = extract_unique_locations(pages)
    print(f"  Found {len(locations)} locations")

    # Deduplicate
    print("\nDeduplicating locations with LLM...")
    locations = await deduplicate_locations_with_llm(locations)
    print(f"  Merged to {len(locations)} unique locations")

    # Analyze with LLM
    print(f"\nAnalyzing locations with Gemini 2.5 Flash (concurrency: {max_concurrent})...")
    requirements = []
    async for req in process_locations_streaming(
        locations, project_id=project_id, target_city=target_city, max_concurrent=max_concurrent
    ):
        requirements.append(req)
        print(f"  [{len(requirements)}/{len(locations)}] {req.scene_number}: {req.scene_header}")
        print(f"      Vibe: {req.vibe.primary.value} | {req.constraints.interior_exterior} | {req.constraints.time_of_day}")
        if req.constraints.special_requirements:
            print(f"      Special: {', '.join(req.constraints.special_requirements[:3])}")

    print(f"\nStage 1 complete: {len(requirements)} location requirements")
    return requirements


def get_sample_requirements(project_id: str, target_city: str) -> list:
    """
    Get sample LocationRequirement objects for testing Stage 2 without Stage 1.
    """
    from app.models.location import LocationRequirement, Vibe, Constraints
    from app.grounding.models import VibeCategory

    return [
        LocationRequirement(
            project_id=project_id,
            scene_number="SC_001",
            scene_header="INT. ABANDONED WAREHOUSE - NIGHT",
            page_numbers=[12, 15, 23],
            script_excerpt="The vast warehouse is dimly lit by flickering fluorescent lights...",
            vibe=Vibe(
                primary=VibeCategory.INDUSTRIAL,
                secondary=VibeCategory.URBAN_GRITTY,
                descriptors=["abandoned", "massive ceilings", "concrete floors", "exposed pipes"],
                confidence=0.9,
            ),
            constraints=Constraints(
                interior_exterior="interior",
                time_of_day="night",
                special_requirements=["loading dock", "breakaway windows"],
            ),
            estimated_shoot_hours=12,
            priority="critical",
            target_city=target_city,
            location_description="Large industrial warehouse with high ceilings and gritty atmosphere.",
            scouting_notes="Must have vehicle access. Needs to look abandoned but be structurally sound.",
        ),
        LocationRequirement(
            project_id=project_id,
            scene_number="SC_002",
            scene_header="EXT. UPSCALE RESTAURANT PATIO - DAY",
            page_numbers=[34],
            script_excerpt="Sunlight filters through the pergola as waiters in white jackets serve champagne...",
            vibe=Vibe(
                primary=VibeCategory.LUXURY,
                descriptors=["elegant", "outdoor dining", "upscale", "daytime ambiance"],
                confidence=0.85,
            ),
            constraints=Constraints(
                interior_exterior="exterior",
                time_of_day="day",
                special_requirements=["outdoor seating", "upscale decor"],
            ),
            estimated_shoot_hours=6,
            priority="important",
            target_city=target_city,
            location_description="Elegant outdoor restaurant patio with upscale atmosphere.",
            scouting_notes="Needs natural light control options. Background noise should be manageable.",
        ),
    ]


async def run_stage2(
    requirements: list,
    save_to_db: bool = False,
    verify_visuals: bool = True,
    max_concurrent: int = 15,
) -> list:
    """
    Run Stage 2: Find and verify real-world locations for each requirement.

    Returns list of GroundingResult objects.
    """
    from app.grounding.grounding_agent import GroundingAgent
    from app.grounding.models import LocationRequirement as Stage2Requirement

    print("\n" + "=" * 60)
    print("STAGE 2: GROUNDING & DISCOVERY")
    print("=" * 60)

    # Convert Stage 1 output to Stage 2 input if needed
    # (Should be compatible now, but this handles any edge cases)
    stage2_requirements = []
    for req in requirements:
        # Convert to dict and back to ensure compatibility
        req_dict = req.model_dump()
        stage2_req = Stage2Requirement(**req_dict)
        stage2_requirements.append(stage2_req)

    print(f"\nProcessing {len(stage2_requirements)} location requirements (concurrency: {max_concurrent})...")
    if not verify_visuals:
        print("(Visual verification DISABLED)")

    agent = GroundingAgent()
    results = await agent.process_scenes(
        stage2_requirements,
        verify_visuals=verify_visuals,
        save_to_db=save_to_db,
        max_concurrent=max_concurrent,
    )

    # Print results summary
    for result in results:
        print(f"\n  Scene: {result.scene_id}")
        print(f"  Query: {result.query_used}")
        print(f"  Found: {result.total_found} candidates")
        if result.errors:
            print(f"  Errors: {result.errors}")

    total_candidates = sum(r.total_found for r in results)
    print(f"\nStage 2 complete: {total_candidates} total candidates found")

    return results


def save_results_to_json(requirements: list, results: list, output_dir: Path) -> None:
    """Save pipeline results to JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Save Stage 1 output
    stage1_file = output_dir / f"stage1_requirements_{timestamp}.json"
    with open(stage1_file, "w") as f:
        json.dump([r.model_dump(mode="json") for r in requirements], f, indent=2, default=str)
    print(f"\nStage 1 output saved: {stage1_file}")

    # Save Stage 2 output
    stage2_file = output_dir / f"stage2_results_{timestamp}.json"
    with open(stage2_file, "w") as f:
        json.dump([r.model_dump(mode="json") for r in results], f, indent=2, default=str)
    print(f"Stage 2 output saved: {stage2_file}")


def print_final_summary(requirements: list, results: list) -> None:
    """Print a final summary of the pipeline run."""
    print("\n" + "=" * 60)
    print("PIPELINE SUMMARY")
    print("=" * 60)

    total_candidates = sum(r.total_found for r in results)
    total_errors = sum(len(r.errors) for r in results)
    total_time = sum(r.processing_time_seconds for r in results)

    with_phone = sum(
        1 for r in results
        for c in r.candidates
        if c.phone_number
    )

    visually_verified = sum(
        1 for r in results
        for c in r.candidates
        if c.visual_vibe_score is not None
    )

    print(f"\nLocations analyzed (Stage 1): {len(requirements)}")
    print(f"Candidates found (Stage 2): {total_candidates}")
    print(f"  - With phone number: {with_phone}")
    print(f"  - Visually verified: {visually_verified}")
    print(f"Total errors: {total_errors}")
    print(f"Stage 2 processing time: {total_time:.2f}s")


async def main():
    parser = argparse.ArgumentParser(
        description="Test Stage 1 -> Stage 2 pipeline"
    )
    parser.add_argument(
        "--pdf",
        type=str,
        help="Path to PDF screenplay file for Stage 1 analysis"
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Use sample data instead of running Stage 1"
    )
    parser.add_argument(
        "--project-id",
        type=str,
        default=None,
        help="Project ID (auto-generated if not provided)"
    )
    parser.add_argument(
        "--target-city",
        type=str,
        default="Los Angeles, CA",
        help="Target city for location search"
    )
    parser.add_argument(
        "--save-db",
        action="store_true",
        help="Save results to Supabase database"
    )
    parser.add_argument(
        "--stage1-only",
        action="store_true",
        help="Only run Stage 1 (script analysis)"
    )
    parser.add_argument(
        "--stage2-only",
        action="store_true",
        help="Only run Stage 2 with sample data"
    )
    parser.add_argument(
        "--no-visual",
        action="store_true",
        help="Skip visual verification (faster, no Perplexity API needed)"
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=15,
        help="Max concurrent API calls (default: 15)"
    )

    args = parser.parse_args()

    # Validate arguments
    if not args.pdf and not args.sample and not args.stage2_only:
        print("ERROR: Must specify --pdf or --sample or --stage2-only")
        parser.print_help()
        sys.exit(1)

    # Generate project ID if not provided
    project_id = args.project_id or f"test_{str(uuid4())[:8]}"
    print(f"\nProject ID: {project_id}")
    print(f"Target City: {args.target_city}")

    requirements = []
    results = []

    # Run Stage 1 (or use sample data)
    if args.stage2_only or args.sample:
        print("\n" + "=" * 60)
        print("STAGE 1: SCRIPT ANALYSIS (using sample data)")
        print("=" * 60)
        requirements = get_sample_requirements(project_id, args.target_city)
        print(f"\nLoaded {len(requirements)} sample location requirements:\n")
        for req in requirements:
            print(f"  {req.scene_number}: {req.scene_header}")
            print(f"      Vibe: {req.vibe.primary.value} | {req.constraints.interior_exterior} | {req.constraints.time_of_day}")
            if req.constraints.special_requirements:
                print(f"      Special: {', '.join(req.constraints.special_requirements[:3])}")
            print()
    else:
        # Check Stage 1 environment
        if not check_stage1_env():
            sys.exit(1)

        pdf_path = Path(args.pdf)
        if not pdf_path.exists():
            print(f"ERROR: PDF file not found: {args.pdf}")
            sys.exit(1)

        requirements = await run_stage1_from_pdf(pdf_path, project_id, args.target_city, args.concurrency)

    # Optionally stop after Stage 1
    if args.stage1_only:
        output_dir = Path(__file__).parent / "output"
        output_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        stage1_file = output_dir / f"stage1_requirements_{timestamp}.json"
        with open(stage1_file, "w") as f:
            json.dump([r.model_dump(mode="json") for r in requirements], f, indent=2, default=str)
        print(f"\nStage 1 output saved: {stage1_file}")
        print("\nStopping after Stage 1 (--stage1-only)")
        return

    # Check Stage 2 environment
    if not check_stage2_env():
        print("\nCannot run Stage 2 without GOOGLE_CLOUD_PROJECT")
        sys.exit(1)

    # Run Stage 2
    results = await run_stage2(
        requirements,
        save_to_db=args.save_db,
        verify_visuals=not args.no_visual,
        max_concurrent=args.concurrency,
    )

    # Save results
    output_dir = Path(__file__).parent / "output"
    save_results_to_json(requirements, results, output_dir)

    # Print summary
    print_final_summary(requirements, results)

    if args.save_db:
        print("\n[Results saved to Supabase]")


if __name__ == "__main__":
    asyncio.run(main())
