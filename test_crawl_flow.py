import time
import httpx

def test_crawl():
    client = httpx.Client(timeout=30.0)
    print("Initiating crawl job for https://example.com ...")
    resp = client.post("http://127.0.0.1:8000/api/crawl", json={
        "url": "https://example.com",
        "max_pages": 2,
        "max_depth": 1,
        "provider": "local"
    })
    data = resp.json()
    job_id = data["job_id"]
    print(f"Job registered: {job_id}")

    for i in range(15):
        time.sleep(1)
        st = client.get(f"http://127.0.0.1:8000/api/crawl/status/{job_id}").json()
        print(f"Status [{i+1}s]: {st['status']} - {st['progress']}% - {st['current_action']}")
        if st["status"] in ["completed", "failed"]:
            break

    assert st["status"] == "completed"
    print("Crawl completed successfully! Checking chunks:")
    kb_id = st["kb_id"]
    chunks_resp = client.get(f"http://127.0.0.1:8000/api/knowledge-bases/{kb_id}/chunks").json()
    print(f"Chunks generated: {chunks_resp['total']}")
    print("ALL CRAWL TESTS PASSED!")

if __name__ == "__main__":
    test_crawl()
