fp = '/opt/oonrumail/app/services/ai-assistant/handlers/features.go'
with open(fp) as f:
    c = f.read()
c = c.replace('"encoding/json"', '"context"\n\t"encoding/json"')
with open(fp, 'w') as f:
    f.write(c)
print('Added context import')
