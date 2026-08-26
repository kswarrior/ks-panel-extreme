package db

import "testing"

func TestRebindPostgres(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"plain", "SELECT * FROM users WHERE id = ?", "SELECT * FROM users WHERE id = $1"},
		{
			"multiple",
			"INSERT INTO settings (key, value) VALUES (?, ?)",
			"INSERT INTO settings (key, value) VALUES ($1, $2)",
		},
		{
			"question mark inside string literal is data",
			"SELECT * FROM t WHERE msg = 'a?b' AND id = ?",
			"SELECT * FROM t WHERE msg = 'a?b' AND id = $1",
		},
		{
			"escaped quote then placeholder",
			"SELECT * FROM t WHERE msg = 'it''s ? fine' AND id = ?",
			"SELECT * FROM t WHERE msg = 'it''s ? fine' AND id = $1",
		},
		{
			"double-quoted identifier",
			`SELECT "weird?col" FROM t WHERE id = ?`,
			`SELECT "weird?col" FROM t WHERE id = $1`,
		},
		{
			"line comment hides question mark",
			"SELECT 1 -- what? \nWHERE id = ?",
			"SELECT 1 -- what? \nWHERE id = $1",
		},
		{
			"block comment hides question mark",
			"SELECT /* which? */ 1 WHERE id = ?",
			"SELECT /* which? */ 1 WHERE id = $1",
		},
		{
			"existing ordinals preserved, question marks numbered after them",
			"SELECT * FROM t WHERE a = $1 AND b = ?",
			"SELECT * FROM t WHERE a = $1 AND b = $2",
		},
		{
			"string literal containing doubled quotes",
			"INSERT INTO t (note) VALUES ('say ''hi?'' ok') RETURNING id",
			"INSERT INTO t (note) VALUES ('say ''hi?'' ok') RETURNING id",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := rebindPostgres(tc.in); got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

func TestRebindPostgresNoPlaceholdersUnchanged(t *testing.T) {
	in := "CREATE INDEX IF NOT EXISTS idx_users_suspended ON users(suspended)"
	if got := rebindPostgres(in); got != in {
		t.Fatalf("got %q want unchanged %q", got, in)
	}
}

func TestBareCreateIndex(t *testing.T) {
	cases := []struct {
		stmt string
		want bool
	}{
		{"CREATE INDEX idx_a ON users(email)", true},
		{"CREATE UNIQUE INDEX idx_b ON nodes(token)", true},
		{"  create index idx_c on instances(name)", true},
		{"CREATE INDEX IF NOT EXISTS idx_d ON users(id)", false},
		{"CREATE TABLE users (id INTEGER)", false},
		{"INSERT INTO permissions (key) VALUES ('x')", false},
	}
	for _, tc := range cases {
		if got := bareCreateIndex(tc.stmt); got != tc.want {
			t.Errorf("bareCreateIndex(%q) = %v want %v", tc.stmt, got, tc.want)
		}
	}
	m := createIndexRe.FindStringSubmatch("CREATE UNIQUE INDEX idx_app ON application_runs(application_id)")
	if m == nil || m[1] != "idx_app" || m[2] != "application_runs" {
		t.Fatalf("captures wrong: %v", m)
	}
}
