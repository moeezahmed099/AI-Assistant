from dotenv import load_dotenv
load_dotenv('backend/.env')

from app.services.clip_search_service import CLIPSearchService

svc = CLIPSearchService()
print('Service initialized. Index size:', svc.index.ntotal)

TEST_IMAGE = r"data/sample_images/10003.jpg"

results = svc.search(TEST_IMAGE, top_k=5)
print(f"Requested top_k=5, got {len(results)} resolved results")
for r in results:
    print(r['rank'], r['catalog_item_id'], r['product_display_name'], r['similarity_score'])
