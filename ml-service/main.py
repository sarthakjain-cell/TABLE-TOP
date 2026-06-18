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
    # Fetch data including created_at to determine time context
    query = text("""
    SELECT s.id as session_id, oi."menuItemId" as menu_item_id, s."createdAt" as created_at
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

    # Group by session_id to form baskets, determining the time context bucket for each
    session_baskets = defaultdict(set)
    session_times = {}
    
    for row in result:
        session_id = getattr(row, 'session_id', row[0])
        menu_item_id = getattr(row, 'menu_item_id', row[1])
        created_at = getattr(row, 'created_at', row[2])
        
        session_baskets[session_id].add(menu_item_id)
        if session_id not in session_times and created_at:
            session_times[session_id] = created_at
            
    # Map each session to a time bucket
    buckets = {
        "MORNING": [],   # 05:00 - 11:59
        "AFTERNOON": [], # 12:00 - 16:59
        "EVENING": [],   # 17:00 - 21:59
        "NIGHT": [],     # 22:00 - 04:59
        "ALL": []        # The anti-sparsity fallback bucket containing everything
    }
    
    for sess_id, basket in session_baskets.items():
        buckets["ALL"].append(basket)
        
        created_at = session_times.get(sess_id)
        if created_at:
            hour = created_at.hour
            if 5 <= hour < 12:
                buckets["MORNING"].append(basket)
            elif 12 <= hour < 17:
                buckets["AFTERNOON"].append(basket)
            elif 17 <= hour < 22:
                buckets["EVENING"].append(basket)
            else:
                buckets["NIGHT"].append(basket)
                
    all_rules = []
    
    # Run FP-Growth logic separately for each time bucket
    for time_context, baskets in buckets.items():
        total_baskets = len(baskets)
        
        if total_baskets < 2:
            continue # Skip this bucket due to extreme sparsity
            
        # Support for 1-itemsets
        item_counts = defaultdict(int)
        for basket in baskets:
            for item in basket:
                item_counts[item] += 1
                
        # Support for 2-itemsets
        pair_counts = defaultdict(int)
        for basket in baskets:
            for pair in itertools.combinations(sorted(list(basket)), 2):
                pair_counts[pair] += 1
                
        min_support_count = max(total_baskets * 0.01, 2)
        min_confidence = 0.1
        
        for pair, count in pair_counts.items():
            if count < min_support_count:
                continue
                
            item_a, item_b = pair
            
            # Rule: A -> B
            conf_a_b = count / item_counts[item_a]
            lift_a_b = conf_a_b / (item_counts[item_b] / total_baskets)
            if conf_a_b >= min_confidence:
                all_rules.append((item_a, item_b, conf_a_b, lift_a_b, time_context))
                
            # Rule: B -> A
            conf_b_a = count / item_counts[item_b]
            lift_b_a = conf_b_a / (item_counts[item_a] / total_baskets)
            if conf_b_a >= min_confidence:
                all_rules.append((item_b, item_a, conf_b_a, lift_b_a, time_context))
                
    if not all_rules:
        return {"status": "skipped", "message": "No rules generated across any buckets."}

    # Save to Database with timeContext mapping
    with engine.begin() as conn:
        conn.execute(text('DELETE FROM "RecommendationRule" WHERE "restaurantId" = :rest_id'), {"rest_id": restaurant_id})
        
        insert_query = text("""
        INSERT INTO "RecommendationRule" ("id", "antecedentId", "consequentId", "confidence", "lift", "restaurantId", "timeContext", "createdAt")
        VALUES (gen_random_uuid(), :ant, :cons, :conf, :lift, :rest_id, :time_ctx, NOW())
        """)
        
        for rule in all_rules:
            conn.execute(insert_query, {
                "ant": rule[0],
                "cons": rule[1],
                "conf": float(rule[2]),
                "lift": float(rule[3]),
                "time_ctx": rule[4],
                "rest_id": restaurant_id
            })
                
    return {"status": "success", "message": f"Generated {len(all_rules)} context-aware rules."}

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == '__main__':
    import uvicorn
    import os
    port = int(os.environ.get('PORT', 8000))
    # Bind to :: (IPv6) because Railway's private network uses IPv6
    uvicorn.run(app, host='::', port=port)
