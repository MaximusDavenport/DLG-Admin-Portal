-- Seed data for DLG Admin Portal

-- Insert clients
INSERT OR IGNORE INTO clients (tenant_id, name, contact_name, contact_email, contact_phone, status) VALUES
(1, 'Strategic Consulting Group LLC', 'David R. Martinez', 'david.martinez@strategiconsult.com', '(555) 234-5679', 'active'),
(1, 'Enterprise Solutions Inc', 'Lisa Thompson', 'lisa.thompson@enterprisesol.com', '(555) 345-6789', 'active'),
(1, 'Innovate Financial Services', 'Amanda Rodriguez', 'amanda.rodriguez@innovatefinance.com', '(555) 456-7890', 'active'),
(1, 'RetailMax International', 'Robert Kim', 'robert.kim@retailmax.com', '(555) 789-0123', 'active'),
(1, 'EduTech Innovations', 'Sophie Taylor', 'sophie.taylor@edutech.com', '(555) 012-3456', 'active'),
(2, 'TechStart Inc', 'Sarah Johnson', 'sarah.johnson@techstart.com', '(555) 123-4567', 'active'),
(2, 'MedTech Solutions Ltd', 'Dr. James Park', 'j.park@medtechsolutions.com', '(555) 567-8901', 'active'),
(2, 'CloudFirst Technologies', 'Jennifer Wu', 'jennifer.wu@cloudfirst.tech', '(555) 890-1234', 'active'),
(2, 'LogiFlow Systems', 'Carlos Martinez', 'carlos.martinez@logiflow.com', '(555) 123-4567', 'inactive'),
(3, 'GrowthCorp', 'Michael Chen', 'm.chen@growthcorp.biz', '(555) 987-6543', 'active'),
(3, 'GreenEnergy Corp', 'Rachel Green', 'rachel.green@greenenergy.com', '(555) 678-9012', 'active'),
(3, 'HealthPlus Network', 'Mark Davis', 'mark.davis@healthplus.net', '(555) 901-2345', 'active');

-- Insert projects
INSERT OR IGNORE INTO projects (tenant_id, client_id, name, description, status, start_date, due_date, value_cents) VALUES
(1, 1, 'Digital Transformation Strategy', 'Complete digital transformation roadmap and implementation', 'in_progress', '2024-01-10', '2024-06-30', 5000000),
(1, 2, 'Enterprise Architecture Review', 'Comprehensive enterprise architecture assessment', 'planned', '2024-03-01', '2024-08-15', 3200000),
(1, 3, 'Financial Dashboard Platform', 'Real-time financial analytics dashboard with AI insights', 'in_progress', '2024-02-01', '2024-07-31', 4200000),
(1, 3, 'Mobile Trading App', 'Real-time stock trading mobile application', 'completed', '2023-09-01', '2024-01-15', 2800000),
(1, 4, 'Inventory Management System', 'Multi-location inventory tracking and optimization', 'review', '2024-01-05', '2024-05-20', 3600000),
(1, 5, 'Learning Management System', 'Interactive online education platform with AI tutoring', 'in_progress', '2024-01-15', '2024-07-15', 3300000),
(2, 6, 'E-commerce Platform', 'Full-stack e-commerce solution with Stripe integration', 'in_progress', '2024-01-15', '2024-03-30', 2500000),
(2, 6, 'Mobile App Development', 'React Native mobile application', 'review', '2023-12-01', '2024-02-28', 3500000),
(2, 7, 'Telemedicine Portal', 'Secure patient-doctor video consultation platform', 'planned', '2024-03-15', '2024-09-30', 3800000),
(2, 7, 'Medical Records Integration', 'EMR system integration and data migration', 'completed', '2023-11-01', '2024-02-28', 2200000),
(2, 8, 'Cloud Migration Service', 'Complete infrastructure migration to AWS/Azure', 'in_progress', '2024-02-10', '2024-08-30', 5500000),
(2, 9, 'Supply Chain Optimization', 'AI-powered logistics and supply chain management', 'on_hold', '2024-03-01', '2024-12-31', 4800000),
(3, 10, 'CRM Implementation', 'Custom CRM system implementation', 'planned', '2024-02-01', '2024-05-15', 1800000),
(3, 10, 'Website Redesign', 'Complete website overhaul', 'completed', '2023-10-01', '2024-01-20', 1200000),
(3, 11, 'Solar Panel Management System', 'IoT-based solar panel monitoring and optimization', 'in_progress', '2024-01-20', '2024-06-15', 2900000),
(3, 12, 'Patient Management Portal', 'Comprehensive patient records and appointment system', 'planned', '2024-04-01', '2024-10-15', 4100000);

-- Insert invoices
INSERT OR IGNORE INTO invoices (tenant_id, client_id, project_id, number, amount_cents, status, due_date) VALUES
(1, 1, 1, 'DLG-INV-001', 2500000, 'pending', '2024-04-15'),
(1, 2, 2, 'DLG-INV-002', 1600000, 'paid', '2024-02-28'),
(1, 3, 3, 'DLG-INV-003', 2100000, 'pending', '2024-04-30'),
(1, 3, 4, 'DLG-INV-006', 2800000, 'paid', '2024-01-15'),
(1, 3, 3, 'DLG-INV-007', 2100000, 'pending', '2024-08-15'),
(1, 4, 5, 'DLG-INV-004', 1800000, 'overdue', '2024-03-10'),
(1, 5, 6, 'DLG-INV-005', 1650000, 'paid', '2024-04-15'),
(2, 6, 7, 'INV-2024-001', 1250000, 'overdue', '2024-03-15'),
(2, 6, 8, 'INV-2024-003', 1750000, 'paid', '2024-02-28'),
(2, 7, 9, 'INV-2024-005', 950000, 'pending', '2024-05-15'),
(2, 7, 10, 'INV-2024-010', 2200000, 'paid', '2024-02-28'),
(2, 8, 11, 'INV-2024-007', 2750000, 'pending', '2024-05-01'),
(2, 8, 11, 'INV-2024-012', 2750000, 'overdue', '2024-04-01'),
(2, 9, 12, 'INV-2024-009', 1200000, 'draft', '2024-04-30'),
(3, 10, 13, 'INV-2024-002', 450000, 'pending', '2024-03-30'),
(3, 10, 14, 'INV-2024-004', 600000, 'paid', '2024-01-25'),
(3, 11, 15, 'INV-2024-006', 1450000, 'paid', '2024-03-20'),
(3, 11, 15, 'INV-2024-011', 1450000, 'pending', '2024-07-01'),
(3, 12, 16, 'INV-2024-008', 1025000, 'pending', '2024-06-01');