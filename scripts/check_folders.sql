SELECT mf.name, mf.special_use, m.email
FROM mail_folders mf JOIN mailboxes m ON mf.mailbox_id = m.id
WHERE m.email = 'admin@skillancer.com'
ORDER BY mf.sort_order;
