"""
Test Supabase connection and basic operations.

Usage:
    python -m testing.test_supabase
"""

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
    """Check if Supabase env vars are set."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")

    if not url:
        print("❌ SUPABASE_URL not set")
        return False
    if not key:
        print("❌ SUPABASE_SECRET_KEY not set")
        return False

    print(f"✓ SUPABASE_URL: {url[:40]}...")
    print(f"✓ SUPABASE_SECRET_KEY: {key[:20]}...")
    return True


def test_connection():
    """Test basic Supabase connection."""
    print("\n── Testing Connection ──")

    try:
        from app.db.client import get_supabase_client
        client = get_supabase_client()
        print("✓ Client created successfully")
        return client
    except Exception as e:
        print(f"❌ Failed to create client: {e}")
        return None


def test_tables_exist(client) -> bool:
    """Check if tables exist."""
    print("\n── Checking Tables ──")

    tables = ["projects", "scenes", "location_candidates", "bookings"]
    all_ok = True

    for table in tables:
        try:
            result = client.table(table).select("id").limit(1).execute()
            print(f"✓ {table} - exists")
        except Exception as e:
            print(f"❌ {table} - {e}")
            all_ok = False

    return all_ok


def test_crud_operations(client) -> bool:
    """Test basic CRUD operations."""
    print("\n── Testing CRUD ──")

    # Create a test project
    test_project = {
        "name": "Test Project (Delete Me)",
        "company_name": "Test Company",
        "target_city": "Los Angeles, CA",
        "status": "draft",
    }

    try:
        # CREATE
        result = client.table("projects").insert(test_project).execute()
        project_id = result.data[0]["id"]
        print(f"✓ CREATE - project {project_id[:8]}...")

        # READ
        result = client.table("projects").select("*").eq("id", project_id).execute()
        if result.data:
            print(f"✓ READ - found project")

        # UPDATE
        result = client.table("projects").update({"status": "analyzing"}).eq("id", project_id).execute()
        print(f"✓ UPDATE - status changed")

        # DELETE
        result = client.table("projects").delete().eq("id", project_id).execute()
        print(f"✓ DELETE - project removed")

        return True

    except Exception as e:
        print(f"❌ CRUD failed: {e}")
        return False


def test_repositories() -> bool:
    """Test repository layer."""
    print("\n── Testing Repositories ──")

    try:
        from app.db.repository import ProjectRepository

        # Test ProjectRepository
        repo = ProjectRepository()
        project = repo.create(
            name="Repo Test Project",
            company_name="Test Co",
        )
        print(f"✓ ProjectRepository.create() - {project['id'][:8]}...")

        # Clean up
        repo._table().delete().eq("id", project["id"]).execute()
        print(f"✓ Cleaned up test project")

        return True

    except Exception as e:
        print(f"❌ Repository test failed: {e}")
        return False


def main():
    print("=" * 50)
    print("SUPABASE CONNECTION TEST")
    print("=" * 50)

    has_errors = False

    # Check environment
    if not check_env():
        print("\n⚠️  Set your environment variables in .env")
        sys.exit(1)

    # Test connection
    client = test_connection()
    if not client:
        print("\n⚠️  Check your SUPABASE_URL and SUPABASE_SECRET_KEY")
        sys.exit(1)

    # Test tables
    if not test_tables_exist(client):
        has_errors = True

    # Test CRUD
    if not test_crud_operations(client):
        has_errors = True

    # Test repositories
    if not test_repositories():
        has_errors = True

    print("\n" + "=" * 50)
    if has_errors:
        print("❌ Some tests failed!")
        sys.exit(1)
    else:
        print("✓ All tests passed!")
    print("=" * 50)


if __name__ == "__main__":
    main()
