"""
Test runner for Stage 2: Grounding & Discovery

Run this script independently to test the grounding agent with sample inputs.

Usage:
    # Test single scene
    python -m testing.test_grounding

    # Test all scenes
    python -m testing.test_grounding --all

    # Test specific scene by number
    python -m testing.test_grounding --scene SC_012

Environment variables required:
    GOOGLE_CLOUD_PROJECT=your-project-id
    GOOGLE_CLOUD_LOCATION=global
    GOOGLE_GENAI_USE_VERTEXAI=True
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Load .env file
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

from app.grounding.grounding_agent import GroundingAgent
from app.grounding.models import GroundingResult, LocationCandidate
from testing.sample_inputs import get_sample_requirements, get_single_sample, print_requirements_summary


def check_environment() -> bool:
    """Check if required environment variables are set."""
    if not os.environ.get("GOOGLE_CLOUD_PROJECT"):
        print("\n ERROR: GOOGLE_CLOUD_PROJECT not set in .env")
        print("\n1. Copy .env.example to .env")
        print("2. Set your Google Cloud project ID")
        print("3. Authenticate with: gcloud auth application-default login")
        return False

    return True


def print_candidate(candidate: LocationCandidate, index: int) -> None:
    """Print details of a location candidate."""
    phone_status = "YES" if candidate.phone_number else "NO (needs manual research)"

    print(f"\n  [{index}] {candidate.venue_name}")
    print(f"      Address: {candidate.formatted_address}")
    print(f"      Phone: {candidate.phone_number or 'N/A'} [{phone_status}]")
    print(f"      Website: {candidate.website_url or 'N/A'}")
    print(f"      Rating: {candidate.google_rating or 'N/A'} ({candidate.google_review_count} reviews)")
    print(f"      Match Score: {candidate.match_score:.2f}")
    print(f"      Status: {candidate.status.value}")

    if candidate.match_reasoning:
        print(f"      Why: {candidate.match_reasoning[:100]}...")

    # Visual verification results
    if candidate.visual_vibe_score is not None:
        print(f"      Visual Vibe Score: {candidate.visual_vibe_score:.2f}")
        if candidate.visual_features_detected:
            print(f"      Detected Features: {', '.join(candidate.visual_features_detected[:3])}")
        if candidate.visual_analysis_summary:
            print(f"      Visual Summary: {candidate.visual_analysis_summary[:80]}...")

    if candidate.red_flags:
        print(f"      Concerns: {', '.join(candidate.red_flags[:3])}")


def print_result(result: GroundingResult) -> None:
    """Print a grounding result."""
    print("\n" + "-" * 60)
    print(f"Scene: {result.scene_id}")
    print(f"Query: {result.query_used}")
    print(f"Found: {result.total_found} candidates")
    print(f"Time: {result.processing_time_seconds:.2f}s")

    if result.errors:
        print(f"\n  ERRORS:")
        for error in result.errors:
            print(f"    - {error}")

    if result.warnings:
        print(f"\n  WARNINGS:")
        for warning in result.warnings:
            print(f"    - {warning}")

    if result.candidates:
        print(f"\n  CANDIDATES:")
        for i, candidate in enumerate(result.candidates, 1):
            print_candidate(candidate, i)


def save_results(results: list[GroundingResult], output_dir: Path) -> None:
    """Save results to JSON files."""
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for result in results:
        filename = f"grounding_{result.scene_id}_{timestamp}.json"
        filepath = output_dir / filename

        # Convert to dict for JSON serialization
        result_dict = result.model_dump(mode="json")

        with open(filepath, "w") as f:
            json.dump(result_dict, f, indent=2, default=str)

        print(f"\nSaved: {filepath}")


async def test_single_scene() -> None:
    """Test grounding with a single scene."""
    print("\n" + "=" * 60)
    print("STAGE 2 GROUNDING TEST - Single Scene")
    print("=" * 60)

    requirement = get_single_sample()
    print(f"\nTesting scene: {requirement.scene_header}")
    print(f"Vibe: {requirement.vibe.primary.value}")
    print(f"Descriptors: {', '.join(requirement.vibe.descriptors)}")

    agent = GroundingAgent()
    result = await agent.find_locations(requirement)

    print_result(result)

    # Save results
    output_dir = Path(__file__).parent / "output"
    save_results([result], output_dir)


async def test_all_scenes() -> None:
    """Test grounding with all sample scenes."""
    print("\n" + "=" * 60)
    print("STAGE 2 GROUNDING TEST - All Scenes")
    print("=" * 60)

    requirements = get_sample_requirements()
    print_requirements_summary(requirements)

    print("\nStarting grounding for all scenes...")

    agent = GroundingAgent()
    results = await agent.find_locations_for_scenes(requirements)

    for result in results:
        print_result(result)

    # Save results
    output_dir = Path(__file__).parent / "output"
    save_results(results, output_dir)

    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    total_candidates = sum(r.total_found for r in results)
    total_errors = sum(len(r.errors) for r in results)
    total_time = sum(r.processing_time_seconds for r in results)

    with_phone = sum(
        1 for r in results
        for c in r.candidates
        if c.phone_number
    )
    without_phone = total_candidates - with_phone

    # Visual verification stats
    visually_verified = sum(
        1 for r in results
        for c in r.candidates
        if c.visual_vibe_score is not None
    )
    high_visual_match = sum(
        1 for r in results
        for c in r.candidates
        if c.visual_vibe_score is not None and c.visual_vibe_score >= 0.7
    )

    print(f"\nScenes processed: {len(results)}")
    print(f"Total candidates found: {total_candidates}")
    print(f"  - With phone number: {with_phone}")
    print(f"  - Without phone (needs manual): {without_phone}")
    if visually_verified > 0:
        print(f"  - Visually verified: {visually_verified}")
        print(f"  - High visual match (>=0.7): {high_visual_match}")
    print(f"Total errors: {total_errors}")
    print(f"Total processing time: {total_time:.2f}s")


async def test_specific_scene(scene_number: str) -> None:
    """Test grounding for a specific scene by number."""
    requirements = get_sample_requirements()

    # Find the matching scene
    requirement = next(
        (r for r in requirements if r.scene_number == scene_number),
        None
    )

    if not requirement:
        print(f"\nERROR: Scene '{scene_number}' not found.")
        print("\nAvailable scenes:")
        for r in requirements:
            print(f"  - {r.scene_number}: {r.scene_header}")
        return

    print("\n" + "=" * 60)
    print(f"STAGE 2 GROUNDING TEST - Scene {scene_number}")
    print("=" * 60)

    print(f"\nTesting scene: {requirement.scene_header}")
    print(f"Vibe: {requirement.vibe.primary.value}")
    print(f"Descriptors: {', '.join(requirement.vibe.descriptors)}")

    agent = GroundingAgent()
    result = await agent.find_locations(requirement)

    print_result(result)

    # Save results
    output_dir = Path(__file__).parent / "output"
    save_results([result], output_dir)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Test Stage 2 Grounding & Discovery"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Test all sample scenes"
    )
    parser.add_argument(
        "--scene",
        type=str,
        help="Test specific scene by number (e.g., SC_012)"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available sample scenes"
    )

    args = parser.parse_args()

    # List scenes
    if args.list:
        requirements = get_sample_requirements()
        print_requirements_summary(requirements)
        return

    # Check environment
    if not check_environment():
        sys.exit(1)

    # Run appropriate test
    if args.scene:
        asyncio.run(test_specific_scene(args.scene))
    elif args.all:
        asyncio.run(test_all_scenes())
    else:
        asyncio.run(test_single_scene())


if __name__ == "__main__":
    main()
