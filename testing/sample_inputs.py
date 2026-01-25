"""
Sample inputs for testing Stage 2: Grounding & Discovery

These are assumed inputs that would come from Stage 1 (Script Analysis).
Each LocationRequirement represents a scene that needs a real-world location.
"""

from app.grounding.models import (
    Constraints,
    LocationRequirement,
    Vibe,
    VibeCategory,
)


# Sample Project ID (would come from database in production)
SAMPLE_PROJECT_ID = "proj_nightshift_001"


def get_sample_requirements() -> list[LocationRequirement]:
    """
    Get sample LocationRequirements for testing.

    These simulate the output from Stage 1 (Script Analysis).
    """
    return [
        # Scene 1: Abandoned Warehouse (Climax scene)
        LocationRequirement(
            project_id=SAMPLE_PROJECT_ID,
            scene_number="SC_012",
            scene_header="INT. ABANDONED WAREHOUSE - NIGHT",
            page_numbers=[23, 24, 25],
            script_excerpt="""
            The cavernous space echoes with their footsteps. Moonlight streams
            through broken skylights, casting long shadows across the concrete floor.
            Industrial equipment rusts in the corners. MARCUS backs against a
            brick column as the ANTAGONIST approaches.
            """,
            vibe=Vibe(
                primary=VibeCategory.INDUSTRIAL,
                secondary=VibeCategory.URBAN_GRITTY,
                descriptors=["abandoned", "brick walls", "high ceilings", "concrete floors"],
                confidence=0.92,
            ),
            constraints=Constraints(
                interior_exterior="interior",
                time_of_day="night",
                special_requirements=["large windows/skylights", "no active business", "high ceilings"],
            ),
            estimated_shoot_hours=12,
            priority="critical",
            target_city="Los Angeles, CA",
            max_results=5,
        ),

        # Scene 2: Upscale Restaurant (Character meeting)
        LocationRequirement(
            project_id=SAMPLE_PROJECT_ID,
            scene_number="SC_007",
            scene_header="INT. UPSCALE RESTAURANT - EVENING",
            page_numbers=[14, 15],
            script_excerpt="""
            White tablecloths. Crystal glasses catching candlelight.
            ELENA sits alone at a corner table, checking her watch.
            A WAITER in black approaches with menus. The restaurant
            hums with quiet conversation and soft jazz.
            """,
            vibe=Vibe(
                primary=VibeCategory.LUXURY,
                secondary=None,
                descriptors=["elegant", "candlelit", "white tablecloths", "upscale"],
                confidence=0.88,
            ),
            constraints=Constraints(
                interior_exterior="interior",
                time_of_day="night",
                special_requirements=["private dining area", "classic decor"],
            ),
            estimated_shoot_hours=8,
            priority="important",
            target_city="Los Angeles, CA",
            max_results=5,
        ),

        # Scene 3: Suburban House (Family home)
        LocationRequirement(
            project_id=SAMPLE_PROJECT_ID,
            scene_number="SC_003",
            scene_header="EXT. SUBURBAN HOUSE - DAY",
            page_numbers=[5, 6],
            script_excerpt="""
            A two-story craftsman home with a white picket fence.
            Kids' bikes on the lawn. An AMERICAN FLAG waves from
            the porch. The neighborhood is quiet, tree-lined streets.
            SARAH pulls into the driveway in her minivan.
            """,
            vibe=Vibe(
                primary=VibeCategory.SUBURBAN,
                secondary=VibeCategory.RESIDENTIAL,
                descriptors=["craftsman style", "white picket fence", "tree-lined", "family home"],
                confidence=0.95,
            ),
            constraints=Constraints(
                interior_exterior="both",
                time_of_day="day",
                special_requirements=["front porch", "driveway", "backyard"],
            ),
            estimated_shoot_hours=10,
            priority="important",
            target_city="Los Angeles, CA",
            max_results=5,
        ),

        # Scene 4: Retro Diner (Meeting point)
        LocationRequirement(
            project_id=SAMPLE_PROJECT_ID,
            scene_number="SC_019",
            scene_header="INT. RETRO DINER - MORNING",
            page_numbers=[34, 35],
            script_excerpt="""
            Chrome stools line the counter. A WAITRESS in a pink
            uniform refills coffee. Neon signs glow in the window.
            The jukebox plays 50s rock and roll. DETECTIVE JONES
            slides into a red vinyl booth.
            """,
            vibe=Vibe(
                primary=VibeCategory.RETRO_VINTAGE,
                secondary=VibeCategory.COMMERCIAL,
                descriptors=["1950s style", "chrome", "neon signs", "vinyl booths", "jukebox"],
                confidence=0.91,
            ),
            constraints=Constraints(
                interior_exterior="interior",
                time_of_day="day",
                special_requirements=["counter seating", "booth seating", "authentic 50s decor"],
            ),
            estimated_shoot_hours=6,
            priority="flexible",
            target_city="Los Angeles, CA",
            max_results=5,
        ),

        # Scene 5: Hospital Corridor (Dramatic scene)
        LocationRequirement(
            project_id=SAMPLE_PROJECT_ID,
            scene_number="SC_028",
            scene_header="INT. HOSPITAL CORRIDOR - NIGHT",
            page_numbers=[52, 53],
            script_excerpt="""
            Fluorescent lights flicker overhead. A NURSE rushes past
            with a crash cart. The walls are institutional green.
            MARCUS runs down the corridor, checking room numbers.
            An overhead speaker announces a code blue.
            """,
            vibe=Vibe(
                primary=VibeCategory.INSTITUTIONAL,
                secondary=None,
                descriptors=["fluorescent lighting", "sterile", "long corridors", "institutional"],
                confidence=0.87,
            ),
            constraints=Constraints(
                interior_exterior="interior",
                time_of_day="night",
                special_requirements=["hospital aesthetic", "long hallways", "private access"],
            ),
            estimated_shoot_hours=8,
            priority="important",
            target_city="Los Angeles, CA",
            max_results=5,
        ),
    ]


def get_single_sample() -> LocationRequirement:
    """Get a single sample requirement for quick testing."""
    return get_sample_requirements()[0]


def print_requirements_summary(requirements: list[LocationRequirement]) -> None:
    """Print a summary of the requirements."""
    print("\n" + "=" * 60)
    print("SAMPLE LOCATION REQUIREMENTS")
    print("=" * 60)

    for i, req in enumerate(requirements, 1):
        print(f"\n[{i}] {req.scene_number}: {req.scene_header}")
        print(f"    Vibe: {req.vibe.primary.value}")
        print(f"    Descriptors: {', '.join(req.vibe.descriptors[:3])}")
        print(f"    Priority: {req.priority}")
        print(f"    Target City: {req.target_city}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    requirements = get_sample_requirements()
    print_requirements_summary(requirements)
