"""
End-to-end integration test: Stage 1 -> Stage 2 -> Stage 3 (VAPI Calling)

This script tests the complete pipeline from screenplay analysis to outbound calls.

Usage:
    # Test with sample data (recommended)
    python -m testing.test_integration --sample

    # Test with real PDF
    python -m testing.test_integration --pdf path/to/screenplay.pdf

    # Test without VAPI calling (Stages 1-2 only)
    python -m testing.test_integration --sample --skip-calling

    # Custom user phone number
    python -m testing.test_integration --sample --user-phone +19999999999

Environment variables required:
    OPENAI_API_KEY=your-openai-key          (for Stage 1)
    GOOGLE_CLOUD_PROJECT=your-project-id    (for Stage 2)
    VAPI_API_KEY=your-vapi-key              (for Stage 3)
    VAPI_PHONE_NUMBER_ID=your-phone-id      (for Stage 3)
    VAPI_ASSISTANT_ID=your-assistant-id     (for Stage 3)
    SUPABASE_URL=https://xxx.supabase.co    (required for DB operations)
    SUPABASE_SECRET_KEY=your-key            (required for DB operations)
"""

import argparse
import asyncio
import json
import sys
import time
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

from app.db.repository import LocationCandidateRepository, ProjectRepository
from app.grounding.models import LocationCandidate, VapiCallStatus, CandidateStatus
from app.vapi.call_context import CallContext, ProjectContext
from app.vapi.service import VapiService


def check_env() -> dict[str, bool]:
    """Check which environment variables are configured."""
    return {
        "stage1": bool(os.environ.get("OPENAI_API_KEY")),
        "stage2": bool(os.environ.get("GOOGLE_CLOUD_PROJECT")),
        "stage3": bool(
            os.environ.get("VAPI_API_KEY")
            and os.environ.get("VAPI_PHONE_NUMBER_ID")
            and os.environ.get("VAPI_ASSISTANT_ID")
        ),
        "database": bool(
            os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SECRET_KEY")
        ),
    }


async def run_stage1_and_stage2(
    use_sample: bool,
    pdf_path: Path | None,
    project_id: str,
    target_city: str,
    verify_visuals: bool,
    max_concurrent: int,
) -> tuple[list, list]:
    """
    Run Stage 1 (script analysis) and Stage 2 (grounding).

    Returns (requirements, grounding_results)
    """
    from testing.test_pipeline import run_stage1_from_pdf, get_sample_requirements, run_stage2
    from app.db.repository import SceneRepository, ProjectRepository

    # Stage 1: Get location requirements
    if use_sample:
        print("\n" + "=" * 60)
        print("STAGE 1: SCRIPT ANALYSIS (using sample data)")
        print("=" * 60)
        requirements = get_sample_requirements(project_id, target_city)
        print(f"\nLoaded {len(requirements)} sample location requirements")
        for req in requirements:
            print(f"  {req.scene_number}: {req.scene_header}")
            print(
                f"      Vibe: {req.vibe.primary.value} | "
                f"{req.constraints.interior_exterior} | {req.constraints.time_of_day}"
            )
    else:
        requirements = await run_stage1_from_pdf(pdf_path, project_id, target_city, max_concurrent)

    # Create project record in database
    project_repo = ProjectRepository()
    try:
        project_repo.create(
            name=f"Integration Test - {datetime.now().strftime('%Y%m%d_%H%M%S')}",
            company_name="Wondr Films Testing",
            target_city=target_city,
            id=project_id,  # Pass the project_id we generated
        )
        print(f"\nCreated project record in database: {project_id}")
    except Exception as e:
        # Project might already exist from a previous run
        print(f"\nProject may already exist: {e}")

    # Create scene records in database before running Stage 2
    scene_repo = SceneRepository()
    scene_repo.create_many(requirements)
    print(f"Created {len(requirements)} scene records in database")

    # Stage 2: Ground to real venues (always save to DB for integration test)
    results = await run_stage2(
        requirements,
        save_to_db=True,
        verify_visuals=verify_visuals,
        max_concurrent=max_concurrent,
    )

    return requirements, results


def collect_candidates_with_phones(grounding_results: list) -> list[LocationCandidate]:
    """
    Collect all candidates that have phone numbers from grounding results.

    Returns list of LocationCandidate objects.
    """
    candidates = []
    for result in grounding_results:
        for candidate in result.candidates:
            if candidate.phone_number:
                candidates.append(candidate)

    return candidates


async def inject_user_phone_number(
    user_phone: str,
    requirements: list,
    grounding_results: list,
) -> LocationCandidate:
    """
    Create a synthetic candidate with the user's phone number for testing.

    This candidate will be added to the database and included in the call list.
    """
    from app.grounding.models import LocationCandidate, VapiCallStatus, CandidateStatus

    # Use the first scene for the test candidate
    first_scene = requirements[0]
    first_result = grounding_results[0]

    # Create synthetic candidate
    test_candidate = LocationCandidate(
        scene_id=first_result.scene_id,
        project_id=first_scene.project_id,
        google_place_id="test_verification",
        venue_name="Test Verification - User's Phone",
        formatted_address="Verification Phone Number",
        latitude=34.0522,  # Los Angeles coordinates
        longitude=-118.2437,
        phone_number=user_phone,
        match_score=1.0,
        match_reasoning="Integration test verification number",
        vapi_call_status=VapiCallStatus.NOT_INITIATED,
        status=CandidateStatus.DISCOVERED,
    )

    # Save to database
    repo = LocationCandidateRepository()
    db_result = repo.create(test_candidate)

    print(f"\nInjected test phone number: {user_phone}")
    print(f"  Candidate ID: {test_candidate.id}")
    print(f"  Venue Name: {test_candidate.venue_name}")

    return test_candidate


def prepare_call_list(
    candidates: list[LocationCandidate],
    user_candidate: LocationCandidate,
    max_calls: int,
) -> list[LocationCandidate]:
    """
    Prepare the final list of candidates to call.

    Always includes user_candidate first, then up to (max_calls - 1) real venues.
    """
    # Start with user's phone
    call_list = [user_candidate]

    # Add real venue candidates up to max_calls
    for candidate in candidates:
        if len(call_list) >= max_calls:
            break
        # Skip if this is the user candidate (already added)
        if candidate.id == user_candidate.id:
            continue
        call_list.append(candidate)

    return call_list


async def trigger_vapi_calls(
    candidates: list[LocationCandidate],
    requirements: list,
    max_concurrent: int,
) -> str:
    """
    Trigger VAPI batch calls for all candidates.

    Returns batch_id.
    """
    print("\n" + "=" * 60)
    print("STAGE 3: VAPI CALLING")
    print("=" * 60)

    # Build call contexts
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    project_context = ProjectContext(
        project_id=candidates[0].project_id,
        project_name=f"Integration Test - {timestamp}",
        production_company="Wondr Films Testing",
        filming_dates="February 15-16, 2026",
        crew_size=15,
        special_requirements=["Quick turnaround needed"],
    )

    # Build scene descriptions map
    scene_descriptions = {
        req.id: f"{req.scene_header}: {req.script_excerpt[:100]}..."
        for req in requirements
    }

    call_contexts = []
    for candidate in candidates:
        scene_desc = scene_descriptions.get(candidate.scene_id, "Film production scene")
        context = CallContext(
            candidate=candidate,
            project=project_context,
            scene_description=scene_desc,
        )
        call_contexts.append(context)

    print(f"\nPreparing to call {len(call_contexts)} venues:")
    for i, ctx in enumerate(call_contexts, 1):
        phone = ctx.candidate.phone_number
        # Mask phone except user's (first one)
        if i > 1:
            phone = phone[:5] + "***" + phone[-4:]
        print(f"  {i}. {ctx.candidate.venue_name} ({phone})")

    print(f"\nProject Details:")
    print(f"  Name: {project_context.project_name}")
    print(f"  Company: {project_context.production_company}")
    print(f"  Filming Dates: {project_context.filming_dates}")
    print(f"  Crew Size: {project_context.crew_size}")

    # Trigger batch calls
    print(f"\nTriggering {len(call_contexts)} concurrent calls (max: {max_concurrent})...")
    vapi_service = VapiService()
    batch_id = await vapi_service.trigger_batch_calls(
        contexts=call_contexts,
        max_concurrent=max_concurrent,
    )

    print(f"\nBatch ID: {batch_id}")
    print(f"All calls triggered successfully!")

    return batch_id


async def monitor_call_progress(
    candidate_ids: list[str],
    timeout: int = 600,
    poll_interval: int = 10,
) -> dict[str, dict]:
    """
    Monitor call progress by polling the database.

    Returns dict of {candidate_id: status_info}
    """
    print("\n" + "=" * 60)
    print("MONITORING CALL PROGRESS")
    print("=" * 60)
    print(f"\nPolling every {poll_interval}s (timeout: {timeout}s)...\n")

    repo = LocationCandidateRepository()
    start_time = time.time()
    iteration = 0

    completed_statuses = {"completed", "failed", "no-answer", "voicemail", "busy"}

    while time.time() - start_time < timeout:
        iteration += 1
        elapsed = int(time.time() - start_time)

        # Fetch current status for all candidates
        statuses = {}
        for cand_id in candidate_ids:
            result = repo.get(cand_id)
            if result:
                statuses[cand_id] = {
                    "venue_name": result.get("venue_name"),
                    "phone": result.get("phone_number"),
                    "status": result.get("vapi_call_status"),
                    "vapi_call_id": result.get("vapi_call_id"),
                    "duration": result.get("vapi_call_duration_seconds"),
                }

        # Print status update
        print(f"[{elapsed:03d}s] Status Update:")
        for cand_id, info in statuses.items():
            status = info["status"] or "not_initiated"
            duration = f" ({info['duration']}s)" if info.get("duration") else ""
            print(f"  - {info['venue_name']}: {status.upper()}{duration}")

        # Check if all calls completed
        all_completed = all(
            info["status"] in completed_statuses
            for info in statuses.values()
            if info["status"]
        )

        if all_completed:
            print(f"\nAll calls completed after {elapsed}s!")
            break

        # Wait before next poll
        await asyncio.sleep(poll_interval)
    else:
        print(f"\nMonitoring timed out after {timeout}s")

    return statuses


def verify_database_results(candidate_ids: list[str]) -> dict:
    """
    Verify that database was updated correctly.

    Returns verification summary.
    """
    print("\n" + "=" * 60)
    print("DATABASE VERIFICATION")
    print("=" * 60)

    repo = LocationCandidateRepository()
    summary = {
        "total_candidates": len(candidate_ids),
        "with_vapi_call_id": 0,
        "with_updated_status": 0,
        "completed_calls": 0,
        "failed_calls": 0,
        "no_answer_calls": 0,
        "in_progress_calls": 0,
    }

    for cand_id in candidate_ids:
        result = repo.get(cand_id)
        if not result:
            continue

        if result.get("vapi_call_id"):
            summary["with_vapi_call_id"] += 1

        status = result.get("vapi_call_status")
        if status and status != "not_initiated":
            summary["with_updated_status"] += 1

        if status == "completed":
            summary["completed_calls"] += 1
        elif status == "failed":
            summary["failed_calls"] += 1
        elif status == "no-answer" or status == "voicemail":
            summary["no_answer_calls"] += 1
        elif status in ["ringing", "in-progress", "queued"]:
            summary["in_progress_calls"] += 1

    # Print verification results
    print(f"\nVerification Results:")
    print(f"  Total Candidates: {summary['total_candidates']}")
    print(f"  ✓ With vapi_call_id: {summary['with_vapi_call_id']}/{summary['total_candidates']}")
    print(f"  ✓ With updated status: {summary['with_updated_status']}/{summary['total_candidates']}")
    print(f"\nCall Outcomes:")
    print(f"  ✓ Completed: {summary['completed_calls']}")
    print(f"  ✗ Failed: {summary['failed_calls']}")
    print(f"  ~ No Answer/Voicemail: {summary['no_answer_calls']}")
    print(f"  ⧗ In Progress: {summary['in_progress_calls']}")

    return summary


def print_user_phone_verification(user_candidate_id: str):
    """Print verification results for the user's test phone."""
    print("\n" + "=" * 60)
    print("USER PHONE VERIFICATION")
    print("=" * 60)

    repo = LocationCandidateRepository()
    result = repo.get(user_candidate_id)

    if not result:
        print("\n✗ Could not find user phone candidate in database")
        return

    print(f"\nUser Phone: {result.get('phone_number')}")
    print(f"Call Status: {result.get('vapi_call_status', 'unknown').upper()}")
    print(f"VAPI Call ID: {result.get('vapi_call_id', 'N/A')}")

    if result.get("vapi_call_duration_seconds"):
        print(f"Duration: {result['vapi_call_duration_seconds']}s")

    if result.get("call_summary"):
        print(f"Summary: {result['call_summary']}")

    # Check if call was successful
    status = result.get("vapi_call_status")
    if status == "completed":
        print("\n✓ User phone call COMPLETED successfully!")
    elif status in ["ringing", "in-progress", "queued"]:
        print(f"\n⧗ User phone call still {status.upper()}")
    else:
        print(f"\n✗ User phone call status: {status}")


def print_final_summary(
    requirements: list,
    grounding_results: list,
    call_list: list[LocationCandidate],
    verification_summary: dict,
    total_time: float,
):
    """Print final integration test summary."""
    print("\n" + "=" * 60)
    print("INTEGRATION TEST SUMMARY")
    print("=" * 60)

    total_candidates = sum(r.total_found for r in grounding_results)
    candidates_with_phones = sum(
        1 for r in grounding_results for c in r.candidates if c.phone_number
    )

    print(f"\n✓ Stage 1: {len(requirements)} location requirements")
    print(f"✓ Stage 2: {total_candidates} candidates found ({candidates_with_phones} with phone)")
    print(f"✓ Stage 3: {len(call_list)} calls triggered")

    print(f"\nCall Results:")
    print(f"  ✓ Completed: {verification_summary['completed_calls']}")
    print(f"  ✗ Failed: {verification_summary['failed_calls']}")
    print(f"  ~ No Answer: {verification_summary['no_answer_calls']}")
    print(f"  ⧗ In Progress: {verification_summary['in_progress_calls']}")

    print(f"\nDatabase Integrity:")
    print(f"  ✓ All candidates have vapi_call_id: {verification_summary['with_vapi_call_id']}/{verification_summary['total_candidates']}")
    print(f"  ✓ All candidates have updated status: {verification_summary['with_updated_status']}/{verification_summary['total_candidates']}")

    print(f"\nTotal Duration: {total_time:.1f}s")

    # Determine overall test status
    all_have_call_id = verification_summary['with_vapi_call_id'] == verification_summary['total_candidates']
    all_have_status = verification_summary['with_updated_status'] == verification_summary['total_candidates']

    if all_have_call_id and all_have_status:
        print("\n✓ Integration Test PASSED")
    else:
        print("\n✗ Integration Test FAILED (some calls not processed)")


async def main():
    parser = argparse.ArgumentParser(
        description="End-to-end integration test: Stage 1 -> Stage 2 -> Stage 3 (VAPI)"
    )

    # Input source
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Use sample data instead of PDF (recommended)"
    )
    parser.add_argument(
        "--pdf",
        type=str,
        help="Path to PDF screenplay file"
    )

    # Test configuration
    parser.add_argument(
        "--user-phone",
        type=str,
        default="+19095069035",
        help="User phone number for verification (default: +19095069035)"
    )
    parser.add_argument(
        "--max-calls",
        type=int,
        default=5,
        help="Maximum concurrent calls (default: 5)"
    )
    parser.add_argument(
        "--target-city",
        type=str,
        default="Los Angeles, CA",
        help="Target city for location search"
    )

    # Optional flags
    parser.add_argument(
        "--skip-calling",
        action="store_true",
        help="Skip Stage 3 (only run Stages 1-2)"
    )
    parser.add_argument(
        "--verify-visuals",
        action="store_true",
        help="Enable Perplexity visual verification (slower, costs money)"
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=15,
        help="Max concurrent API calls for Stages 1-2 (default: 15)"
    )
    parser.add_argument(
        "--monitor-timeout",
        type=int,
        default=600,
        help="Call monitoring timeout in seconds (default: 600)"
    )

    args = parser.parse_args()

    # Validate arguments
    if not args.sample and not args.pdf:
        print("ERROR: Must specify --sample or --pdf")
        parser.print_help()
        sys.exit(1)

    if args.pdf:
        pdf_path = Path(args.pdf)
        if not pdf_path.exists():
            print(f"ERROR: PDF file not found: {args.pdf}")
            sys.exit(1)
    else:
        pdf_path = None

    # Check environment
    env_status = check_env()

    print("\n" + "=" * 60)
    print("INTEGRATION TEST: End-to-End Pipeline")
    print("=" * 60)

    print("\nEnvironment Check:")
    print(f"  Stage 1 (OpenAI): {'✓' if env_status['stage1'] else '✗'}")
    print(f"  Stage 2 (Google Cloud): {'✓' if env_status['stage2'] else '✗'}")
    print(f"  Stage 3 (VAPI): {'✓' if env_status['stage3'] else '✗'}")
    print(f"  Database (Supabase): {'✓' if env_status['database'] else '✗'}")

    # Validate required env vars
    if not args.sample and not env_status['stage1']:
        print("\nERROR: OPENAI_API_KEY required for PDF processing")
        sys.exit(1)

    if not env_status['stage2']:
        print("\nERROR: GOOGLE_CLOUD_PROJECT required for Stage 2")
        sys.exit(1)

    if not args.skip_calling and not env_status['stage3']:
        print("\nERROR: VAPI credentials required for Stage 3 calling")
        print("Set VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID")
        sys.exit(1)

    if not env_status['database']:
        print("\nERROR: Supabase credentials required")
        print("Set SUPABASE_URL and SUPABASE_SECRET_KEY")
        sys.exit(1)

    # Generate project ID (must be valid UUID for Supabase)
    project_id = str(uuid4())
    print(f"\nProject ID: {project_id}")
    print(f"Target City: {args.target_city}")
    print(f"User Phone: {args.user_phone}")

    start_time = time.time()

    # Run Stages 1 & 2
    requirements, grounding_results = await run_stage1_and_stage2(
        use_sample=args.sample,
        pdf_path=pdf_path,
        project_id=project_id,
        target_city=args.target_city,
        verify_visuals=args.verify_visuals,
        max_concurrent=args.concurrency,
    )

    # Collect candidates with phone numbers
    candidates_with_phones = collect_candidates_with_phones(grounding_results)

    print("\n" + "=" * 60)
    print("PREPARING CALL LIST")
    print("=" * 60)
    print(f"\nFound {len(candidates_with_phones)} candidates with phone numbers")

    # Inject user's phone number
    user_candidate = await inject_user_phone_number(
        user_phone=args.user_phone,
        requirements=requirements,
        grounding_results=grounding_results,
    )

    # Prepare final call list
    call_list = prepare_call_list(
        candidates=candidates_with_phones,
        user_candidate=user_candidate,
        max_calls=args.max_calls,
    )

    print(f"\nSelected {len(call_list)} candidates for calling (max: {args.max_calls})")

    if args.skip_calling:
        print("\n--skip-calling flag set, stopping before Stage 3")
        print(f"\nTest completed in {time.time() - start_time:.1f}s")
        return

    # Stage 3: Trigger VAPI calls
    batch_id = await trigger_vapi_calls(
        candidates=call_list,
        requirements=requirements,
        max_concurrent=args.max_calls,  # Use max_calls as concurrency limit
    )

    # Monitor call progress
    candidate_ids = [c.id for c in call_list]
    final_statuses = await monitor_call_progress(
        candidate_ids=candidate_ids,
        timeout=args.monitor_timeout,
    )

    # Verify database results
    verification_summary = verify_database_results(candidate_ids)

    # Print user phone verification
    print_user_phone_verification(user_candidate.id)

    # Print final summary
    total_time = time.time() - start_time
    print_final_summary(
        requirements=requirements,
        grounding_results=grounding_results,
        call_list=call_list,
        verification_summary=verification_summary,
        total_time=total_time,
    )


if __name__ == "__main__":
    asyncio.run(main())
