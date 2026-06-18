import os
from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from collections import defaultdict
import itertools

load_dotenv()

app = FastAPI(title="TableTop ML Recommendation Service")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set. Please copy from backend/.env")

engine = create_engine(DATABASE_URL)

@app.post("/train")
def train_model(restaurant_id: str):
    # Fetch data
    query = text("""
    SELECT s.id as session_id, oi."menuItemId" as menu_item_id
    FROM "Session" s
    JOIN "Order" o ON s.id = o."sessionId"
    JOIN "OrderItem" oi ON o.id = oi."orderId"
    WHERE s."restaurantId" = :rest_id
    """)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(query, {"rest_id": restaurant_id}).fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    if not result:
        return {"status": "skipped", "message": "No order data available for this restaurant."}

    # Group by session_id to form baskets
    sessions = defaultdict(set)
    for row in result:
        # Access by tuple index or attribute depending on SQLAlchemy version
        session_id = getattr(row, 'session_id', row[0])
        menu_item_id = getattr(row, 'menu_item_id', row[1])
        sessions[session_id].add(menu_item_id)
        
    baskets = list(sessions.values())
    total_baskets = len(baskets)
    
    if total_baskets < 2:
        return {"status": "skipped", "message": "Not enough baskets to run association rules."}

    # Calculate item frequencies (Support for 1-itemsets)
    item_counts = defaultdict(int)
    for basket in baskets:
        for item in basket:
            item_counts[item] += 1
            
    # Calculate pair frequencies (Support for 2-itemsets)
    pair_counts = defaultdict(int)
    for basket in baskets:
        # Get all unique pairs in this basket
        for pair in itertools.combinations(sorted(list(basket)), 2):
            pair_counts[pair] += 1
            
    # Filter and create rules using Apriori Principles
    min_support_count = max(total_baskets * 0.01, 2) # At least 1% support, minimum 2 occurrences
    min_confidence = 0.1
    
    rules = []
    for pair, count in pair_counts.items():
        if count < min_support_count:
            continue
            
        item_a, item_b = pair
        
        # Rule: A -> B
        conf_a_b = count / item_counts[item_a]
        lift_a_b = conf_a_b / (item_counts[item_b] / total_baskets)
        if conf_a_b >= min_confidence:
            rules.append((item_a, item_b, conf_a_b, lift_a_b))
            
        # Rule: B -> A
        conf_b_a = count / item_counts[item_b]
        lift_b_a = conf_b_a / (item_counts[item_a] / total_baskets)
        if conf_b_a >= min_confidence:
            rules.append((item_b, item_a, conf_b_a, lift_b_a))
            
    if not rules:
        return {"status": "skipped", "message": "No rules generated with minimum confidence."}

    # Save to Database
    with engine.begin() as conn:
        conn.execute(text('DELETE FROM "RecommendationRule" WHERE "restaurantId" = :rest_id'), {"rest_id": restaurant_id})
        
        insert_query = text("""
        INSERT INTO "RecommendationRule" ("id", "antecedentId", "consequentId", "confidence", "lift", "restaurantId", "createdAt")
        VALUES (gen_random_uuid(), :ant, :cons, :conf, :lift, :rest_id, NOW())
        """)
        
        for rule in rules:
            conn.execute(insert_query, {
                "ant": rule[0],
                "cons": rule[1],
                "conf": float(rule[2]),
                "lift": float(rule[3]),
                "rest_id": restaurant_id
            })
                
    return {"status": "success", "message": f"Generated and stored {len(rules)} recommendation rules."}

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == '__main__':
    import uvicorn
    import os
    port = int(os.environ.get('PORT', 8000))
    # Bind to :: (IPv6) because Railway's private network uses IPv6
    uvicorn.run(app, host='::', port=port)
