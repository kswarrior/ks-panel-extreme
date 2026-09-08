package main

import (
	"database/sql"
	"fmt"
	"time"
	_ "modernc.org/sqlite"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/models"
)

func mustExec(db *sql.DB, q string, args ...any) {
	if _, err := db.Exec(q, args...); err != nil { panic(fmt.Sprintf("exec %q: %v", q, err)) }
}
func main(){
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil { panic(err) }
	db.SetMaxOpenConns(1)
	defer db.Close()
	// minimal tables
	mustExec(db, `CREATE TABLE instances (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`)
	mustExec(db, `CREATE TABLE instance_live_state (instance_id INTEGER PRIMARY KEY REFERENCES instances(id) ON DELETE CASCADE, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, metrics TEXT NOT NULL DEFAULT '{}', processes TEXT NOT NULL DEFAULT '[]', ports TEXT NOT NULL DEFAULT '[]', info TEXT NOT NULL DEFAULT '{}')`)
	mustExec(db, `CREATE TABLE instance_sftp (instance_id INTEGER PRIMARY KEY REFERENCES instances(id) ON DELETE CASCADE, enabled INTEGER NOT NULL DEFAULT 1, username TEXT NOT NULL DEFAULT '', port INTEGER NOT NULL DEFAULT 2222, root TEXT NOT NULL DEFAULT '', updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
	mustExec(db, `CREATE TABLE instance_secrets (id INTEGER PRIMARY KEY AUTOINCREMENT, instance_id INTEGER NOT NULL REFERENCES instances(id) ON DELETE CASCADE, key TEXT NOT NULL, value_blob BLOB NOT NULL, is_secret INTEGER NOT NULL DEFAULT 1, description TEXT NOT NULL DEFAULT '', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (instance_id, key))`)
	mustExec(db, `CREATE TABLE themes (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', spec TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0, created_by INTEGER, owner_id INTEGER, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
	mustExec(db, `CREATE TABLE theme_assignments (scope TEXT PRIMARY KEY, theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE)`)
	mustExec(db, `CREATE TABLE instance_automation (id INTEGER PRIMARY KEY AUTOINCREMENT, instance_id INTEGER NOT NULL, name TEXT NOT NULL, command TEXT NOT NULL, schedule TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, secret_refs TEXT NOT NULL DEFAULT '[]', timeout_sec INTEGER NOT NULL DEFAULT 300, last_run_at DATETIME, next_run_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
	mustExec(db, `CREATE TABLE automation_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, instance_id INTEGER NOT NULL, trigger TEXT NOT NULL DEFAULT '', command TEXT NOT NULL DEFAULT '', stdout TEXT NOT NULL DEFAULT '', stderr TEXT NOT NULL DEFAULT '', exit_code INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', started_at DATETIME NOT NULL, finished_at DATETIME)`)
	mustExec(db, `INSERT INTO instances (id, name) VALUES (1, 'test')`)
	mustExec(db, `INSERT INTO themes (id, name, spec, builtin) VALUES ('t1','T1','{}',0)`)
	// 1. LiveState double-save (insert then update path)
	lsRepo := repository.NewLiveStateRepository(db)
	if err := lsRepo.Save(models.InstanceLiveState{InstanceID: 1, Metrics: `{"cpu":1}`, Processes: `[]`, Ports: `[]`, Info: `{}`}); err != nil { panic("live save1: "+err.Error()) }
	if err := lsRepo.Save(models.InstanceLiveState{InstanceID: 1, Metrics: `{"cpu":2}`, Processes: `[]`, Ports: `[]`, Info: `{}`}); err != nil { panic("live save2: "+err.Error()) }
	got, _ := lsRepo.Get(1)
	fmt.Printf("LIVE_OK metrics=%s\n", got.Metrics)
	// 2. SFTP double-upsert
	sftp := repository.NewSFTPRepository(db)
	if err := sftp.Upsert(repository.SFTPConfig{InstanceID: 1, Enabled: 1, Username: "inst_1", Port: 2222, Root: "/data"}); err != nil { panic("sftp1: "+err.Error()) }
	if err := sftp.Upsert(repository.SFTPConfig{InstanceID: 1, Enabled: 0, Username: "inst_1", Port: 2223, Root: "/data2"}); err != nil { panic("sftp2: "+err.Error()) }
	c, _ := sftp.Get(1)
	fmt.Printf("SFTP_OK enabled=%d port=%d root=%s\n", c.Enabled, c.Port, c.Root)
	// 3. Secret set twice (insert then update) + reveal
	sec := repository.NewSecretRepository(db)
	if _, err := sec.Set(1, "API_KEY", "v1", false, "d"); err != nil { panic("sec1: "+err.Error()) }
	if _, err := sec.Set(1, "API_KEY", "v2", false, "d2"); err != nil { panic("sec2: "+err.Error()) }
	v, _ := sec.Reveal(1, "API_KEY")
	fmt.Printf("SECRET_OK value=%s\n", v)
	// 4. Theme assign twice
	th := repository.NewThemeRepository(db)
	if err := th.AssignTheme("admin", "t1"); err != nil { panic("assign1: "+err.Error()) }
	if err := th.AssignTheme("admin", "t1"); err != nil { panic("assign2: "+err.Error()) }
	fmt.Printf("THEME_ASSIGN_OK\n")
	// 5. Automation RecordRun with Command (scheduler path)
	ar := repository.NewAutomationRepository(db)
	jid, _ := ar.Create(repository.AutomationUpsertInput{InstanceID: 1, Name: "j", Command: "echo hi", Schedule: "* * * * *", Enabled: true})
	rid, err := ar.RecordRun(repository.AutomationRunInput{JobID: jid, InstanceID: 1, Trigger: "schedule", Command: "echo hi", StartedAt: time.Now(), FinishedAt: time.Now()})
	if err != nil { panic("recordrun: "+err.Error()) }
	runs, _ := ar.ListRunsByInstance(1, 10)
	cmd := ""
	if len(runs) > 0 { cmd = runs[0].Command }
	fmt.Printf("RUN_OK id=%d cmd=%q\n", rid, cmd)
	if cmd == "" { panic("command empty") }
	fmt.Printf("ALL_VERIFY_OK\n")
}
