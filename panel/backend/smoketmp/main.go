package main

// Temporary tri-engine runtime smoke: exercises every dialect-sensitive
// write path (upserts, KV writes, heartbeat ingest) against the engine
// given on argv. Deleted after verification.

import (
	"fmt"
	"os"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

func die(err error, what string) {
	if err != nil {
		fmt.Println("FAIL:", what, "->", err)
		os.Exit(1)
	}
}

func main() {
	config.SetDatabaseType(os.Args[1], os.Args[2])
	con, err := repository.OpenDB()
	die(err, "open")
	defer con.Close()

	s := repository.NewSettingsRepository(con)
	die(s.SetPanelName("Smoke Panel"), "SetPanelName")

	sec := repository.NewSecurityRepository(con)
	cfg, err := sec.GetConfig()
	die(err, "GetConfig")
	cfg.MaxBodySizeBytes = 4096
	die(sec.UpdateConfig(cfg), "UpdateConfig")

	nr := repository.NewNodeRepository(con)
	node, token, err := nr.CreateNode(repository.CreateNodeInput{Name: "smoke", Address: "127.0.0.1:1"})
	die(err, "CreateNode")
	hb := repository.IngestInput{
		Token:        token,
		RAMUsed:      1,
		RAMTotal:     2,
		CPUPercent:   3,
		DiskUsed:     4,
		DiskTotal:    8,
		UptimeSecs:   5,
		DriverDocker: true,
	}
	die(func() error { _, err := nr.IngestHeartbeat(hb); return err }(), "IngestHeartbeat#1")
	die(func() error { _, err := nr.IngestHeartbeat(hb); return err }(), "IngestHeartbeat#2(upsert)")

	tr := repository.NewThemeRepository(con)
	_, err = tr.CreateTheme(repository.UpsertThemeInput{ID: "smoke", Name: "Smoke", Description: "", Spec: []byte("{}")})
	die(err, "CreateTheme")
	die(tr.AssignTheme("global", "smoke"), "AssignTheme")
	die(tr.AssignTheme("auth", "smoke"), "AssignTheme#2")

	ir := repository.NewInstanceRepository(con)
	instID, err := ir.Create(repository.InstanceCreateInput{
		NodeID: node.ID, TemplateID: 0, OwnerID: 1, Name: "smoke-inst",
		Kind: "docker", Status: "created",
	})
	die(err, "InstanceCreate")
	sr := repository.NewSecretRepository(con)
	die(func() error { _, err := sr.Set(instID, "K", "v", true, ""); return err }(), "SecretSet#1")
	die(func() error { _, err := sr.Set(instID, "K", "v2", true, ""); return err }(), "SecretSet#2(upsert)")

	ar := repository.NewAuthorityRepository(con)
	die(ar.Update(&models.AuthorityConfig{}), "AuthorityUpdate")

	ur := repository.NewUserAuthorityRepository(con)
	die(ur.Update(1, &models.UserAuthorityConfig{}), "UserAuthUpdate")

	rr := repository.NewRoleAuthorityRepository(con)
	die(rr.SetRoleAllowedAuth(1, []string{"password"}), "RoleAuthSave")

	iar := repository.NewInstanceAdvancedRepository(con)
	die(iar.SaveLiveState(instID, models.LiveState{CPUPercent: 10}), "LiveStateSave")

	aar := repository.NewAutomationRepository(con)
	jobID, err := aar.CreateJob(repository.AutomationJobInput{
		InstanceID: instID, Name: "j", Schedule: "", Command: "echo hi", Enabled: true,
	})
	die(err, "AutomationCreateJob")

	fmt.Println("SMOKE OK on", os.Args[1], "(job", jobID, ")")
}
