-- Patch: ensure girlsVersion exists for app-config cache sync
INSERT INTO app_settings (setting_key, setting_value)
VALUES ('girlsVersion', '1')
ON DUPLICATE KEY UPDATE setting_value = setting_value;
