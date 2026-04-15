with open('backend.py', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

old_text = 'if bs_score > sb_score + 15: selected_pattern = "BS"'
new_block = '''gap = abs(bs_score - sb_score)
        top = max(bs_score, sb_score)
        if gap >= 3 and top >= 5: selected_pattern = "BS" if bs_score > sb_score else "SB"
        elif top >= 10: selected_pattern = "BS" if bs_score >= sb_score else "SB"
        else: return None'''

# Find old block and replace the 3-line if/elif/else
lines = content.split('\n')
new_lines = []
skip_next = 0
for i, line in enumerate(lines):
    if skip_next > 0:
        skip_next -= 1
        continue
    if old_text in line:
        indent = '        '
        new_lines.append(indent + 'gap = abs(bs_score - sb_score)')
        new_lines.append(indent + 'top = max(bs_score, sb_score)')
        new_lines.append(indent + 'if gap >= 3 and top >= 5: selected_pattern = "BS" if bs_score > sb_score else "SB"')
        new_lines.append(indent + 'elif top >= 10: selected_pattern = "BS" if bs_score >= sb_score else "SB"')
        new_lines.append(indent + 'else: return None')
        skip_next = 2  # skip old elif and else lines
    else:
        new_lines.append(line)

with open('backend.py', 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))

print("Patched backend.py successfully")
