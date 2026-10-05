"""Turn an image file into a request you can send with curl.
Usage: python3 tools/make_request.py slip.png [expected_amount] > req.json
Then:  curl -s -X POST YOUR_URL/v1/check -H "Content-Type: application/json" -d @req.json"""
import base64, json, sys, pathlib
path = pathlib.Path(sys.argv[1])
mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}[path.suffix.lower()]
item = {"kind": "image", "mime_type": mime, "image_b64": base64.b64encode(path.read_bytes()).decode()}
if len(sys.argv) > 2: item["expected_amount"] = float(sys.argv[2])
print(json.dumps({"business_id": "demo_bakery", "thread": [item]}))
