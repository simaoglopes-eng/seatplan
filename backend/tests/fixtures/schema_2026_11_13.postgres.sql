CREATE TABLE audit_log (
	id SERIAL NOT NULL,
	at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	actor VARCHAR(120) NOT NULL,
	action VARCHAR(60) NOT NULL,
	entity VARCHAR(40) NOT NULL,
	entity_id VARCHAR(64) NOT NULL,
	detail JSON NOT NULL,
	PRIMARY KEY (id)
);
CREATE TABLE demo_links (
	name VARCHAR(80) NOT NULL,
	path VARCHAR(200) NOT NULL,
	PRIMARY KEY (name)
);
CREATE TABLE email_outbox (
	id SERIAL NOT NULL,
	idempotency_key VARCHAR(200) NOT NULL,
	to_email VARCHAR(254) NOT NULL,
	kind VARCHAR(40) NOT NULL,
	subject VARCHAR(200) NOT NULL,
	body_text TEXT NOT NULL,
	body_html TEXT NOT NULL,
	ics TEXT,
	status VARCHAR(10) NOT NULL,
	attempts INTEGER NOT NULL,
	next_attempt_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	sent_at TIMESTAMP WITHOUT TIME ZONE,
	provider_message_id VARCHAR(200),
	last_error TEXT,
	image_png TEXT,
	PRIMARY KEY (id),
	UNIQUE (idempotency_key)
);
CREATE TABLE guest_accounts (
	id SERIAL NOT NULL,
	public_id VARCHAR(32) NOT NULL,
	email VARCHAR(254) NOT NULL,
	name VARCHAR(120) NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	email_proven BOOLEAN DEFAULT TRUE NOT NULL,
	session_version INTEGER NOT NULL,
	consent_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	consent_version VARCHAR(20) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	last_login_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	UNIQUE (email)
);
CREATE TABLE holds (
	id SERIAL NOT NULL,
	scope VARCHAR(120) NOT NULL,
	resource_kind VARCHAR(10) NOT NULL,
	resource_id INTEGER NOT NULL,
	slot_key VARCHAR(40) NOT NULL,
	holder_key VARCHAR(128) NOT NULL,
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_holds_resource UNIQUE (scope, resource_kind, resource_id, slot_key)
);
CREATE TABLE live_versions (
	scope VARCHAR(120) NOT NULL,
	version INTEGER NOT NULL,
	PRIMARY KEY (scope)
);
CREATE TABLE organisers (
	id SERIAL NOT NULL,
	email VARCHAR(254) NOT NULL,
	name VARCHAR(120) NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	role VARCHAR(20) NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (email)
);
CREATE TABLE rate_limits (
	key VARCHAR(200) NOT NULL,
	window_start INTEGER NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (key, window_start)
);
CREATE TABLE venues (
	id SERIAL NOT NULL,
	public_id VARCHAR(32) NOT NULL,
	organiser_id INTEGER NOT NULL,
	kind VARCHAR(20) NOT NULL,
	name VARCHAR(120) NOT NULL,
	timezone VARCHAR(64) NOT NULL,
	width FLOAT NOT NULL,
	height FLOAT NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(organiser_id) REFERENCES organisers (id)
);
CREATE TABLE blackout_dates (
	id SERIAL NOT NULL,
	venue_id INTEGER NOT NULL,
	date DATE NOT NULL,
	reason VARCHAR(200) NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id)
);
CREATE TABLE bookings (
	id SERIAL NOT NULL,
	public_id VARCHAR(32) NOT NULL,
	venue_id INTEGER NOT NULL,
	date DATE NOT NULL,
	start_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	end_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	party_size INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	email VARCHAR(254) NOT NULL,
	phone VARCHAR(40),
	notes VARCHAR(500) NOT NULL,
	needs_accessible BOOLEAN NOT NULL,
	high_chairs INTEGER NOT NULL,
	status VARCHAR(12) NOT NULL,
	source VARCHAR(10) NOT NULL,
	table_choice VARCHAR(10) NOT NULL,
	manage_token_hash VARCHAR(64) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id)
);
CREATE TABLE events (
	id SERIAL NOT NULL,
	public_id VARCHAR(32) NOT NULL,
	venue_id INTEGER NOT NULL,
	organiser_id INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	starts_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	ends_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	privacy_mode VARCHAR(20) NOT NULL,
	change_deadline TIMESTAMP WITHOUT TIME ZONE,
	share_enabled BOOLEAN DEFAULT FALSE NOT NULL,
	share_version INTEGER DEFAULT 0 NOT NULL,
	share_token_hash VARCHAR(64),
	share_cap INTEGER,
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id),
	FOREIGN KEY(organiser_id) REFERENCES organisers (id)
);
CREATE TABLE service_periods (
	id SERIAL NOT NULL,
	venue_id INTEGER NOT NULL,
	name VARCHAR(40) NOT NULL,
	weekday INTEGER NOT NULL,
	start_time TIME WITHOUT TIME ZONE NOT NULL,
	end_time TIME WITHOUT TIME ZONE NOT NULL,
	slot_minutes INTEGER NOT NULL,
	max_covers_per_slot INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id)
);
CREATE TABLE turn_times (
	id SERIAL NOT NULL,
	venue_id INTEGER NOT NULL,
	max_party INTEGER NOT NULL,
	minutes INTEGER NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id)
);
CREATE TABLE waitlist_entries (
	id SERIAL NOT NULL,
	venue_id INTEGER NOT NULL,
	date DATE NOT NULL,
	wanted_time TIME WITHOUT TIME ZONE NOT NULL,
	party_size INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	email VARCHAR(254) NOT NULL,
	status VARCHAR(12) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id)
);
CREATE TABLE zones (
	id SERIAL NOT NULL,
	venue_id INTEGER NOT NULL,
	name VARCHAR(80) NOT NULL,
	kind VARCHAR(20) NOT NULL,
	x FLOAT NOT NULL,
	y FLOAT NOT NULL,
	w FLOAT NOT NULL,
	h FLOAT NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id)
);
CREATE TABLE email_codes (
	id SERIAL NOT NULL,
	email VARCHAR(254) NOT NULL,
	purpose VARCHAR(10) NOT NULL,
	code_hash VARCHAR(64) NOT NULL,
	attempts INTEGER NOT NULL,
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	event_id INTEGER,
	name VARCHAR(120),
	password_hash VARCHAR(255),
	needs_accessible BOOLEAN NOT NULL,
	signup_hash VARCHAR(64),
	share_version INTEGER,
	code_shown BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_email_codes_email_purpose UNIQUE (email, purpose),
	FOREIGN KEY(event_id) REFERENCES events (id)
);
CREATE TABLE guest_groups (
	id SERIAL NOT NULL,
	event_id INTEGER NOT NULL,
	name VARCHAR(80) NOT NULL,
	keep_adjacent BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(event_id) REFERENCES events (id)
);
CREATE TABLE plan_snapshots (
	id SERIAL NOT NULL,
	event_id INTEGER NOT NULL,
	seq INTEGER NOT NULL,
	label VARCHAR(80) NOT NULL,
	assignments JSON NOT NULL,
	score JSON NOT NULL,
	is_current BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_snapshot_seq UNIQUE (event_id, seq),
	FOREIGN KEY(event_id) REFERENCES events (id)
);
CREATE TABLE tables (
	id SERIAL NOT NULL,
	venue_id INTEGER NOT NULL,
	zone_id INTEGER,
	label VARCHAR(40) NOT NULL,
	shape VARCHAR(10) NOT NULL,
	x FLOAT NOT NULL,
	y FLOAT NOT NULL,
	w FLOAT NOT NULL,
	h FLOAT NOT NULL,
	rotation FLOAT NOT NULL,
	min_party INTEGER NOT NULL,
	max_party INTEGER NOT NULL,
	is_accessible BOOLEAN NOT NULL,
	high_chair_ok BOOLEAN NOT NULL,
	combine_group VARCHAR(40),
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id),
	FOREIGN KEY(zone_id) REFERENCES zones (id)
);
CREATE TABLE guests (
	id SERIAL NOT NULL,
	event_id INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	email VARCHAR(254),
	token_hash VARCHAR(64) NOT NULL,
	token_revoked_at TIMESTAMP WITHOUT TIME ZONE,
	group_id INTEGER,
	wants_anonymous BOOLEAN NOT NULL,
	needs_accessible BOOLEAN NOT NULL,
	dietary_note VARCHAR(200),
	reserved_tag VARCHAR(20),
	rsvp VARCHAR(10) NOT NULL,
	account_id INTEGER,
	source VARCHAR(20) DEFAULT 'invited' NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(event_id) REFERENCES events (id),
	UNIQUE (token_hash),
	FOREIGN KEY(group_id) REFERENCES guest_groups (id),
	FOREIGN KEY(account_id) REFERENCES guest_accounts (id)
);
CREATE TABLE seats (
	id SERIAL NOT NULL,
	venue_id INTEGER NOT NULL,
	table_id INTEGER NOT NULL,
	label VARCHAR(40) NOT NULL,
	x FLOAT NOT NULL,
	y FLOAT NOT NULL,
	is_accessible BOOLEAN NOT NULL,
	is_blocked BOOLEAN NOT NULL,
	reserved_tag VARCHAR(20),
	PRIMARY KEY (id),
	FOREIGN KEY(venue_id) REFERENCES venues (id),
	FOREIGN KEY(table_id) REFERENCES tables (id)
);
CREATE TABLE table_slots (
	table_id INTEGER NOT NULL,
	date DATE NOT NULL,
	slot_index INTEGER NOT NULL,
	booking_id INTEGER NOT NULL,
	PRIMARY KEY (table_id, date, slot_index),
	FOREIGN KEY(table_id) REFERENCES tables (id),
	FOREIGN KEY(booking_id) REFERENCES bookings (id)
);
CREATE TABLE acquaintances (
	guest_id INTEGER NOT NULL,
	knows_guest_id INTEGER NOT NULL,
	PRIMARY KEY (guest_id, knows_guest_id),
	FOREIGN KEY(guest_id) REFERENCES guests (id),
	FOREIGN KEY(knows_guest_id) REFERENCES guests (id)
);
CREATE TABLE seat_assignments (
	id SERIAL NOT NULL,
	event_id INTEGER NOT NULL,
	seat_id INTEGER NOT NULL,
	guest_id INTEGER NOT NULL,
	source VARCHAR(10) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_assignment_seat UNIQUE (event_id, seat_id),
	CONSTRAINT uq_assignment_guest UNIQUE (event_id, guest_id),
	FOREIGN KEY(event_id) REFERENCES events (id),
	FOREIGN KEY(seat_id) REFERENCES seats (id),
	FOREIGN KEY(guest_id) REFERENCES guests (id)
);
CREATE TABLE seat_neighbours (
	seat_id INTEGER NOT NULL,
	neighbour_id INTEGER NOT NULL,
	PRIMARY KEY (seat_id, neighbour_id),
	FOREIGN KEY(seat_id) REFERENCES seats (id),
	FOREIGN KEY(neighbour_id) REFERENCES seats (id)
);
CREATE INDEX ix_audit_log_action ON audit_log (action);
CREATE INDEX ix_guest_accounts_public_id ON guest_accounts (public_id);
CREATE INDEX ix_venues_public_id ON venues (public_id);
CREATE INDEX ix_blackout_dates_venue_id ON blackout_dates (venue_id);
CREATE INDEX ix_bookings_manage_token_hash ON bookings (manage_token_hash);
CREATE INDEX ix_bookings_public_id ON bookings (public_id);
CREATE INDEX ix_bookings_venue_id ON bookings (venue_id);
CREATE INDEX ix_events_public_id ON events (public_id);
CREATE UNIQUE INDEX uq_events_share_token ON events (share_token_hash);
CREATE INDEX ix_service_periods_venue_id ON service_periods (venue_id);
CREATE INDEX ix_turn_times_venue_id ON turn_times (venue_id);
CREATE INDEX ix_waitlist_entries_venue_id ON waitlist_entries (venue_id);
CREATE INDEX ix_zones_venue_id ON zones (venue_id);
CREATE INDEX ix_guest_groups_event_id ON guest_groups (event_id);
CREATE INDEX ix_plan_snapshots_event_id ON plan_snapshots (event_id);
CREATE INDEX ix_tables_venue_id ON tables (venue_id);
CREATE INDEX ix_guests_account_id ON guests (account_id);
CREATE INDEX ix_guests_event_id ON guests (event_id);
CREATE UNIQUE INDEX uq_guests_event_account ON guests (event_id, account_id);
CREATE INDEX ix_seats_table_id ON seats (table_id);
CREATE INDEX ix_seats_venue_id ON seats (venue_id);
CREATE INDEX ix_table_slots_booking_id ON table_slots (booking_id);
