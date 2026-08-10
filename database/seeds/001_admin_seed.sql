-- Default admin: admin@premiumstatus.com / Admin@123
INSERT INTO admins (email, password_hash, name)
SELECT 'admin@premiumstatus.com', '$2b$10$pRUFJtpcmFf.FtfDkI8NquAAeSpK3CrYfflyNWyShLcVCo5AH9jrW', 'Admin'
WHERE NOT EXISTS (
  SELECT 1 FROM admins WHERE email = 'admin@premiumstatus.com'
);
