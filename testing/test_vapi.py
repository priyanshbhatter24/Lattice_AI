"""
Test Vapi integration for Stage 3: Voice Outreach.

Usage:
    python -m testing.test_vapi
    python -m testing.test_vapi --call  # Actually trigger a test call (requires phone number)
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Load .env
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

import os


def check_env():
    """Check if Vapi env vars are set."""
    print("\n── Checking Environment ──")

    api_key = os.environ.get("VAPI_API_KEY")
    phone_id = os.environ.get("VAPI_PHONE_NUMBER_ID")
    assistant_id = os.environ.get("VAPI_ASSISTANT_ID")

    all_ok = True

    if not api_key:
        print("❌ VAPI_API_KEY not set")
        all_ok = False
    else:
        print(f"✓ VAPI_API_KEY: {api_key[:15]}...")

    if not phone_id:
        print("❌ VAPI_PHONE_NUMBER_ID not set")
        all_ok = False
    else:
        print(f"✓ VAPI_PHONE_NUMBER_ID: {phone_id}")

    if not assistant_id:
        print("❌ VAPI_ASSISTANT_ID not set")
        all_ok = False
    else:
        print(f"✓ VAPI_ASSISTANT_ID: {assistant_id}")

    return all_ok


def test_config():
    """Test Vapi config loads correctly."""
    print("\n── Testing Config ──")

    try:
        from app.vapi.config import get_vapi_config, validate_vapi_config

        # Test validation
        is_valid = validate_vapi_config()
        if is_valid:
            print("✓ validate_vapi_config() returned True")
        else:
            print("❌ validate_vapi_config() returned False")
            return False

        # Test config loading
        config = get_vapi_config()
        print(f"✓ Config loaded: base_url={config.vapi_base_url}")
        print(f"✓ Max concurrent calls: {config.max_concurrent_calls}")
        print(f"✓ Max call duration: {config.max_call_duration_seconds}s")

        return True

    except Exception as e:
        print(f"❌ Config test failed: {e}")
        return False


def test_extraction_schema():
    """Test extraction schema is valid."""
    print("\n── Testing Extraction Schema ──")

    try:
        from app.vapi.extraction_schema import get_extraction_schema, get_analysis_plan

        schema = get_extraction_schema()
        plan = get_analysis_plan()

        # Check schema has required fields
        props = schema.get("properties", {})
        required_fields = ["venue_available", "availability_slots", "price_quoted", "reservation_method"]

        for field in required_fields:
            if field in props:
                print(f"✓ Schema has field: {field}")
            else:
                print(f"❌ Schema missing field: {field}")
                return False

        # Check plan has all parts
        if plan.get("structuredDataPlan", {}).get("enabled"):
            print("✓ Structured data plan enabled")
        if plan.get("summaryPlan", {}).get("enabled"):
            print("✓ Summary plan enabled")
        if plan.get("successEvaluationPlan", {}).get("enabled"):
            print("✓ Success evaluation plan enabled")

        return True

    except Exception as e:
        print(f"❌ Schema test failed: {e}")
        return False


def test_call_context():
    """Test call context builder."""
    print("\n── Testing Call Context ──")

    try:
        from app.vapi.call_context import CallContext, ProjectContext, build_call_context
        from app.grounding.models import LocationCandidate

        # Create test project context
        project_ctx = ProjectContext(
            project_id="test-project-001",
            project_name="Test Film",
            production_company="Test Productions",
            filming_dates="January 30-31, 2026",
            duration_description="2 full days",
            crew_size=20,
            special_requirements=["parking", "power"],
        )

        print(f"✓ ProjectContext created: {project_ctx.project_name}")

        # Create a mock LocationCandidate
        candidate = LocationCandidate(
            id="test-candidate-001",
            scene_id="test-scene-001",
            project_id="test-project-001",
            venue_name="Test Warehouse",
            phone_number="+1-555-123-4567",
            formatted_address="123 Test St, Los Angeles, CA",
            latitude=34.0522,
            longitude=-118.2437,
        )

        # Create call context
        call_ctx = CallContext(
            candidate=candidate,
            project=project_ctx,
            scene_description="Interior warehouse scene",
        )

        print(f"✓ CallContext created: {call_ctx.candidate.venue_name}")
        print(f"✓ Phone: {call_ctx.candidate.phone_number}")

        # Test payload generation
        payload = call_ctx.to_vapi_call_payload(
            phone_number_id="test-phone-id",
            assistant_id="test-assistant-id",
        )

        if "customer" in payload and "number" in payload["customer"]:
            print("✓ Payload has customer.number")
        if "assistantOverrides" in payload:
            print("✓ Payload has assistantOverrides")
        if "metadata" in payload:
            print(f"✓ Payload has metadata with candidate_id: {payload['metadata'].get('candidate_id')}")

        return True

    except Exception as e:
        print(f"❌ Call context test failed: {e}")
        return False


def test_service_init():
    """Test VapiService can be initialized."""
    print("\n── Testing Service Init ──")

    try:
        from app.vapi.service import VapiService, get_vapi_service

        service = get_vapi_service()
        print(f"✓ VapiService created")
        print(f"✓ Base URL: {service.base_url}")
        print(f"✓ Headers configured: {'Authorization' in service.headers}")

        return True

    except Exception as e:
        print(f"❌ Service init test failed: {e}")
        return False


def test_webhook_parsing():
    """Test webhook payload parsing."""
    print("\n── Testing Webhook Parsing ──")

    try:
        from app.vapi.service import VapiService

        service = VapiService()

        # Sample end-of-call-report payload
        sample_payload = {
            "message": {
                "type": "end-of-call-report",
                "call": {
                    "id": "call_abc123",
                    "duration": 180,
                    "recordingUrl": "https://example.com/recording.mp3",
                    "metadata": {
                        "candidate_id": "test-candidate-001",
                    },
                },
                "transcript": "Hi, this is Alex from Test Productions...",
                "analysis": {
                    "structuredData": {
                        "venue_available": True,
                        "price_quoted": 2500,
                        "price_unit": "full_day",
                        "reservation_method": "email",
                        "reservation_details": "bookings@test.com",
                        "contact_name": "John Smith",
                        "contact_title": "Manager",
                    },
                    "summary": "The venue is available for filming at $2,500/day.",
                    "successEvaluation": 0.9,
                },
            },
        }

        parsed = service.parse_webhook_payload(sample_payload)

        if parsed.get("candidate_id") == "test-candidate-001":
            print("✓ Parsed candidate_id")
        if parsed.get("venue_available") is True:
            print("✓ Parsed venue_available")
        if parsed.get("negotiated_price") == 2500:
            print("✓ Parsed negotiated_price")
        if parsed.get("vapi_call_id") == "call_abc123":
            print("✓ Parsed vapi_call_id")

        # Test status-update parsing
        status_payload = {
            "message": {
                "type": "status-update",
                "status": "in-progress",
                "call": {
                    "id": "call_abc123",
                    "metadata": {"candidate_id": "test-candidate-001"},
                },
            },
        }

        parsed_status = service.parse_webhook_payload(status_payload)
        if parsed_status.get("vapi_call_status") == "in_progress":
            print("✓ Parsed status-update correctly")

        return True

    except Exception as e:
        print(f"❌ Webhook parsing test failed: {e}")
        return False


async def test_trigger_call(phone_number: str):
    """Actually trigger a test call (requires valid phone number)."""
    print("\n── Testing Live Call ──")
    print(f"⚠️  This will make a real call to: {phone_number}")

    try:
        from app.vapi.service import VapiService
        from app.vapi.call_context import CallContext, ProjectContext
        from app.grounding.models import LocationCandidate

        service = VapiService()

        # Build test context
        project_ctx = ProjectContext(
            project_id="test-live-project",
            project_name="Test Film",
            production_company="Test Productions",
            filming_dates="Next week",
            duration_description="1 day",
            crew_size=10,
            special_requirements=[],
        )

        # Create a mock LocationCandidate with valid UUIDs
        from uuid import uuid4
        candidate = LocationCandidate(
            id=str(uuid4()),
            scene_id=str(uuid4()),
            project_id=str(uuid4()),
            venue_name="Test Call",
            phone_number=phone_number,
            formatted_address="123 Test St",
            latitude=34.0522,
            longitude=-118.2437,
        )

        call_ctx = CallContext(
            candidate=candidate,
            project=project_ctx,
            scene_description="Test scene",
        )

        print("Triggering call...")
        call_id = await service.trigger_call(call_ctx)
        print(f"✓ Call triggered! ID: {call_id}")

        return True

    except Exception as e:
        print(f"❌ Live call test failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Test Vapi integration")
    parser.add_argument("--call", type=str, help="Phone number to test call (e.g., +1-555-123-4567)")
    args = parser.parse_args()

    print("=" * 50)
    print("VAPI INTEGRATION TEST")
    print("=" * 50)

    has_errors = False

    # Check environment
    if not check_env():
        print("\n⚠️  Set your Vapi environment variables in .env")
        sys.exit(1)

    # Test config
    if not test_config():
        has_errors = True

    # Test extraction schema
    if not test_extraction_schema():
        has_errors = True

    # Test call context
    if not test_call_context():
        has_errors = True

    # Test service init
    if not test_service_init():
        has_errors = True

    # Test webhook parsing
    if not test_webhook_parsing():
        has_errors = True

    # Test live call if requested
    if args.call:
        if not asyncio.run(test_trigger_call(args.call)):
            has_errors = True

    print("\n" + "=" * 50)
    if has_errors:
        print("❌ Some tests failed!")
        sys.exit(1)
    else:
        print("✓ All tests passed!")
        if not args.call:
            print("\nTo test a live call, run:")
            print("  python -m testing.test_vapi --call +1-YOUR-PHONE")
    print("=" * 50)


if __name__ == "__main__":
    main()
