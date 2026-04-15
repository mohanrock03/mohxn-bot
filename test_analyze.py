import sys
sys.path.append('.')
from backend import analyze_strong_pattern
from pprint import pprint

history = [
    {"issueNumber": "11290", "number": "6"}, # Big
    {"issueNumber": "11289", "number": "2"}, # Small
    {"issueNumber": "11288", "number": "8"}, # Big
    {"issueNumber": "11287", "number": "3"}, # Small
    {"issueNumber": "11286", "number": "1"}, # Small
    {"issueNumber": "11285", "number": "7"}, # Big
    {"issueNumber": "11284", "number": "4"}, # Small
    {"issueNumber": "11283", "number": "6"}, # Big
    {"issueNumber": "11282", "number": "2"}, # Small
    {"issueNumber": "11281", "number": "8"}, # Big
    {"issueNumber": "11280", "number": "3"}, # Small
]

res = analyze_strong_pattern(history)
pprint(res)
