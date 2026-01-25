#!/usr/bin/env python3
"""Run script analysis and output results to JSON."""

import json
import sys
import requests

def main():
    file_path = sys.argv[1] if len(sys.argv) > 1 else "the-social-network-2010.pdf"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "locations_output.json"

    url = f"http://localhost:8000/api/scripts/analyze?file_path={file_path}"

    locations = []

    print(f"Analyzing: {file_path}")
    print(f"Output will be saved to: {output_file}")
    print("-" * 50)

    response = requests.get(url, stream=True)

    for line in response.iter_lines(decode_unicode=True):
        if not line:
            continue

        if line.startswith("data:"):
            data_str = line[5:].strip()
            if not data_str:
                continue

            try:
                data = json.loads(data_str)

                # Check if this is a location event (has scene_id)
                if "scene_id" in data:
                    locations.append(data)
                    print(f"[{len(locations):2d}] {data['scene_id']}: {data['scene_header']}")
                elif "message" in data:
                    print(f"[STATUS] {data['message']}")
                elif "processed" in data:
                    print(f"[PROGRESS] {data['processed']}/{data['total']} ({data['percent']}%)")
                elif "success" in data:
                    print(f"\n[COMPLETE] Total: {data.get('total_locations', len(locations))} locations")

            except json.JSONDecodeError:
                pass

    # Write output
    output = {
        "total_locations": len(locations),
        "locations": locations
    }

    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved {len(locations)} locations to {output_file}")

if __name__ == "__main__":
    main()
