import json
import matplotlib.pyplot as plt
import pandas as pd
import sys

# Load the JSON data
try:
    with open('ai_rules.json', 'r') as f:
        data = json.load(f)
except Exception as e:
    print("Could not read ai_rules.json:", e)
    sys.exit(1)

if not data:
    print("No rules data found to plot.")
    sys.exit(0)

df = pd.DataFrame(data)

# Create a figure with 2 subplots (1 row, 2 columns)
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))

# Plot 1: Scatter plot of Confidence vs Lift
scatter = ax1.scatter(df['confidence'], df['lift'], alpha=0.7, c='blue', s=50)
ax1.set_title('AI Model: Confidence vs. Lift')
ax1.set_xlabel('Confidence (Probability of rule)')
ax1.set_ylabel('Lift (Strength of association)')
ax1.grid(True, linestyle='--', alpha=0.7)

# Annotate a few of the strongest rules (highest lift)
top_lift = df.nlargest(3, 'lift')
for _, row in top_lift.iterrows():
    ax1.annotate(f"{row['antecedent']} -> {row['consequent']}", 
                 (row['confidence'], row['lift']),
                 xytext=(5, 5), textcoords='offset points', fontsize=9)

# Plot 2: Top recommended items (Consequents)
top_consequents = df['consequent'].value_counts().head(10)
top_consequents.plot(kind='bar', ax=ax2, color='coral')
ax2.set_title('Top 10 Most Recommended Items')
ax2.set_xlabel('Menu Item')
ax2.set_ylabel('Number of Times Recommended')
ax2.tick_params(axis='x', rotation=45)

plt.tight_layout()

# Save the plot as an image
plt.savefig('ai_charts.png', dpi=300, bbox_inches='tight')
print("Successfully generated visual charts and saved as ai_charts.png")

