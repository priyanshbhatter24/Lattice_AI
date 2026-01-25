"""
Transcript extraction using OpenAI GPT-5-mini.

Extracts structured data from Vapi call transcripts since Vapi
doesn't return structured analysis data.
"""

import json
import os
from typing import Any

from openai import OpenAI

# Extraction prompt
EXTRACTION_PROMPT = """You are analyzing a phone call transcript between an AI location scout (Alex) and a venue manager.

Extract the following information from the transcript and return it as JSON:

{
  "venue_available": boolean (true if they agreed to a visit/available, false if explicitly unavailable, null if unclear),
  "availability_details": string (specific times mentioned, e.g. "Tuesday at 11:00 AM"),
  "manager_name": string (name of the person spoken to, null if not mentioned),
  "manager_title": string (their role/title if mentioned, null if not),
  "price_quoted": number (price mentioned, null if none),
  "price_unit": string ("hourly", "daily", "flat", null if no price),
  "reservation_method": string ("email", "phone", "website", "in-person", null if not discussed),
  "reservation_details": string (specific instructions for booking, null if none),
  "call_summary": string (2-3 sentence summary of the call outcome)
}

IMPORTANT:
- Only extract information explicitly stated in the transcript
- Use null for fields with no information
- For call_summary, be concise and focus on the outcome (scheduled visit? got pricing? etc.)

Transcript:
"""


def extract_structured_data(transcript: str) -> dict[str, Any]:
    """
    Extract structured data from a call transcript using OpenAI GPT-5-mini.

    Args:
        transcript: The call transcript text

    Returns:
        Dictionary with extracted fields
    """
    if not transcript or not transcript.strip():
        print("[EXTRACT] No transcript provided")
        return {}

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[EXTRACT] ERROR: OPENAI_API_KEY not set")
        return {}

    print(f"[EXTRACT] Extracting data from transcript ({len(transcript)} chars)...")

    try:
        client = OpenAI(api_key=api_key)

        response = client.responses.create(
            model="gpt-5-mini",
            input=f"{EXTRACTION_PROMPT}\n{transcript}\n\nJSON:",
        )

        output_text = response.output_text.strip()
        print(f"[EXTRACT] Raw response: {output_text}")

        # Parse the JSON from the response
        # Handle potential markdown code blocks
        if output_text.startswith("```"):
            # Extract JSON from code block
            lines = output_text.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.startswith("```"):
                    in_block = not in_block
                    continue
                if in_block:
                    json_lines.append(line)
            output_text = "\n".join(json_lines)

        extracted = json.loads(output_text)
        print(f"[EXTRACT] Extracted data: {extracted}")
        return extracted

    except json.JSONDecodeError as e:
        print(f"[EXTRACT] ERROR: Failed to parse JSON: {e}")
        print(f"[EXTRACT] Raw output was: {output_text}")
        return {}
    except Exception as e:
        print(f"[EXTRACT] ERROR: OpenAI API call failed: {e}")
        return {}
