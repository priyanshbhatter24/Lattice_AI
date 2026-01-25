"""
Vapi extraction schema for structured data extraction from calls.

This schema defines what information the AI should extract from
venue negotiation calls.
"""

# JSON Schema for structured data extraction
EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "venue_available": {
            "type": "boolean",
            "description": "Whether the venue allows filming at all",
        },
        "availability_slots": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Date in YYYY-MM-DD format",
                    },
                    "day_name": {
                        "type": "string",
                        "description": "Day of week (Monday, Tuesday, etc.)",
                    },
                    "start_time": {
                        "type": "string",
                        "description": "Available start time in HH:MM format",
                    },
                    "end_time": {
                        "type": "string",
                        "description": "Available end time in HH:MM format",
                    },
                },
            },
            "description": "Specific available time slots over next 5 business days",
        },
        "price_quoted": {
            "type": "number",
            "description": "Price quoted in USD",
        },
        "price_unit": {
            "type": "string",
            "enum": ["hourly", "half_day", "full_day", "flat_fee"],
            "description": "Unit for the quoted price",
        },
        "additional_fees": {
            "type": "string",
            "description": "Any additional fees mentioned (cleaning, security, etc.)",
        },
        "reservation_method": {
            "type": "string",
            "enum": ["email", "call", "website"],
            "description": "How to make a reservation",
        },
        "reservation_details": {
            "type": "string",
            "description": "Email address, callback number, or website URL for booking",
        },
        "contact_name": {
            "type": "string",
            "description": "Name of person spoken with",
        },
        "contact_title": {
            "type": "string",
            "description": "Title/role of contact (e.g., Manager, Owner)",
        },
        "is_decision_maker": {
            "type": "boolean",
            "description": "Whether contact can approve the booking",
        },
        "red_flags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Any restrictions, concerns, or dealbreakers",
        },
        "additional_notes": {
            "type": "string",
            "description": "Other relevant information from the call",
        },
    },
    "required": ["venue_available"],
}

# Complete analysis plan for Vapi assistant
ANALYSIS_PLAN = {
    "structuredDataPlan": {
        "enabled": True,
        "schema": EXTRACTION_SCHEMA,
    },
    "summaryPlan": {
        "enabled": True,
        "prompt": (
            "Summarize this call in 2-3 sentences. Include: "
            "whether venue is available, the price quoted, and how to book."
        ),
    },
    "successEvaluationPlan": {
        "enabled": True,
        "rubric": (
            "Did the agent successfully gather: "
            "1) availability info, 2) pricing, 3) reservation method? "
            "Score 0-1."
        ),
    },
}


def get_extraction_schema() -> dict:
    """Get the extraction schema for Vapi calls."""
    return EXTRACTION_SCHEMA


def get_analysis_plan() -> dict:
    """Get the complete analysis plan for Vapi assistant configuration."""
    return ANALYSIS_PLAN
