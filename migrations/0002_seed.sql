-- Seed tenants
INSERT OR IGNORE INTO tenants (id, key, name) VALUES
  (1, 'DLG', 'Davenport Legacy Group'),
  (2, 'GA', 'Grow Affordably'),
  (3, 'BYF', 'Build Your Foundation');

-- Seed users (password_salt + password_hash use s1<KEY>)
-- Password for all is password123 with salt s1<KEY>
INSERT OR IGNORE INTO users (tenant_id, email, name, role, password_salt, password_hash) VALUES
  (1, 'maximus@davenportlegacy.com', 'Maximus', 'admin', 's1DLG', 'a02236a4d3b986498e52271afc1601676303d881070de3ea50a7126bf8bb3841'),
  (1, 'admin@davenportlegacy.com', 'DLG Admin', 'admin', 's1DLG', 'a02236a4d3b986498e52271afc1601676303d881070de3ea50a7126bf8bb3841'),
  (2, 'testuser@ga.com', 'GA User', 'client', 's1GA', '5b65fa0fce8b944d11009072c6705c0e93454ed7ac4ff12167e387257c2eb028'),
  (3, 'testuser@byf.com', 'BYF User', 'client', 's1BYF', 'f49f41adfb05f7fb5f88daa3a77cb24f3b68dfbf2c7271eef3aaf78c5f461f46');

-- Seed clients
INSERT OR IGNORE INTO clients (tenant_id, name, contact_name, contact_email, contact_phone, status) VALUES
  (2, 'TechStart Inc', 'Sarah Johnson', 'sarah.johnson@techstart.com', '(555) 123-4567', 'active'),
  (3, 'GrowthCorp', 'Michael Chen', 'm.chen@growthcorp.biz', '(555) 987-6543', 'active');

-- Seed projects
INSERT OR IGNORE INTO projects (tenant_id, client_id, name, description, status, start_date, due_date, value_cents) VALUES
  (2, 1, 'E-commerce Platform', 'Full-stack e-commerce solution with Stripe integration', 'in_progress', '2024-01-15', '2024-03-30', 2500000),
  (3, 2, 'CRM Implementation', 'Custom CRM system implementation', 'planned', '2024-02-01', '2024-05-15', 1800000),
  (2, 1, 'Mobile App Development', 'React Native mobile application', 'review', '2023-12-01', '2024-02-28', 3500000),
  (3, 2, 'Website Redesign', 'Complete website overhaul', 'completed', '2023-10-01', '2024-01-20', 1200000);

-- Seed invoices
INSERT OR IGNORE INTO invoices (tenant_id, client_id, project_id, number, amount_cents, status, due_date) VALUES
  (2, 1, 1, 'INV-2024-001', 1250000, 'overdue', '2024-03-15'),
  (3, 2, 2, 'INV-2024-002', 450000, 'pending', '2024-03-30'),
  (2, 1, 3, 'INV-2024-003', 1750000, 'paid', '2024-02-28'),
  (3, 2, 4, 'INV-2024-004', 600000, 'paid', '2024-01-25');

-- Seed activities
INSERT OR IGNORE INTO activities (tenant_id, type, description, created_at) VALUES
  (1, 'project', 'New project started for GA client', datetime('now','-2 hours')),
  (1, 'invoice', 'Invoice #1001 paid by BYF client', datetime('now','-4 hours')),
  (1, 'meeting', 'Team meeting scheduled for next week', datetime('now','-6 hours'));
