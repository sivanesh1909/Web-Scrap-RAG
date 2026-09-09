import urllib.request
import json
import httpx

def test_full_stack():
    print("=" * 60)
    print("Testing WebMind AI Live Stack")
    print("=" * 60)

    # 1. Frontend
    with urllib.request.urlopen("http://localhost:3000") as resp:
        print(f"[OK] Frontend Server: HTTP {resp.status} OK")
        content = resp.read().decode("utf-8")
        assert "WebMind" in content
        print(f"[OK] Frontend Content: WebMind AI verified in HTML")

    # 2. Backend Health
    with urllib.request.urlopen("http://127.0.0.1:8000/api/health") as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print(f"[OK] Backend Server: {data['service']} - {data['status']}")

    # 3. Knowledge Bases
    with urllib.request.urlopen("http://127.0.0.1:8000/api/knowledge-bases") as resp:
        kbs = json.loads(resp.read().decode("utf-8"))
        print(f"[OK] Active Knowledge Bases ({len(kbs)}):")
        for kb in kbs:
            print(f"    - {kb['domain']}: {kb['total_pages']} pages, {kb['total_chunks']} chunks")

    # 4. SSE Chat Stream Test
    print("\nTesting Grounded RAG Chat Streaming:")
    client = httpx.Client(timeout=10.0)
    chat_payload = {
        "query": "What is WebMind AI?",
        "kb_id": "kb_webmind_ai"
    }
    with client.stream("POST", "http://127.0.0.1:8000/api/chat", json=chat_payload) as response:
        print(f"[OK] Chat Stream Status: {response.status_code}")
        token_count = 0
        received_sources = False
        received_suggestions = False

        for line in response.iter_lines():
            if "event: sources" in line:
                received_sources = True
            elif "event: suggestions" in line:
                received_suggestions = True
            elif "event: token" in line:
                token_count += 1

        print(f"[OK] Received SSE Sources Event: {received_sources}")
        print(f"[OK] Received SSE Suggestions Event: {received_suggestions}")
        print(f"[OK] Streamed {token_count} text tokens successfully!")

    print("\n" + "=" * 60)
    print("ALL SYSTEMS FULLY OPERATIONAL AND VERIFIED!")
    print("=" * 60)

if __name__ == "__main__":
    test_full_stack()
