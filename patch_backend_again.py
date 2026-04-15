with open('backend.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the single confirmed_period assignment in the loops
new_bs = '        if selected_pattern == "BS" and results[i] == "Big" and results[i+1] == "Small":\n            strong_pair = (issue_numbers[i], issue_numbers[i+1]); confirmed_period = issue_numbers[i+1]; break'
new_sb = '        elif selected_pattern == "SB" and results[i] == "Small" and results[i+1] == "Big":\n            strong_pair = (issue_numbers[i], issue_numbers[i+1]); confirmed_period = issue_numbers[i+1]; break'

if 'confirmed_period = issue_numbers[i+1]; break' in content:
    # First replacement for BS
    content = content.replace(
        '        if selected_pattern == "BS" and results[i] == "Big" and results[i+1] == "Small":\n            confirmed_period = issue_numbers[i+1]; break',
        new_bs
    )
    # Second replacement for SB
    content = content.replace(
        '        elif selected_pattern == "SB" and results[i] == "Small" and results[i+1] == "Big":\n            confirmed_period = issue_numbers[i+1]; break',
        new_sb
    )

with open('backend.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("backend.py updated successfully")
