import requests
import sys

# Replace with the actual Restaurant ID from the URL or database
rest_id = "SARTHAKJAIN01"

print(f"Triggering ML training for restaurant: {rest_id}...")
try:
    response = requests.post(f"http://localhost:8000/train?restaurant_id={rest_id}")
    print("Response Status Code:", response.status_code)
    print("Response JSON:", response.json())
except Exception as e:
    print("Error:", e)
