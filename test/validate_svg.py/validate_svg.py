#!/usr/bin/env python3
"""Validate that each file given on argv is well-formed XML rooted at <svg>.
Prints one JSON object: {filename: true/false}."""
import json
import sys
import xml.etree.ElementTree as ET

out = {}
for path in sys.argv[1:]:
    try:
        root = ET.parse(path).getroot()
        out[path] = root.tag.endswith("svg")
    except Exception:
        out[path] = False
print(json.dumps(out))
