SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'api_keys'
ORDER BY ordinal_position;
