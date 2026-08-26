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
		Token:      token,
		RAMUsed:    1,
		RAMTotal:   2,
		CPUPercent: 3,
		DiskUsed:   4,
		DiskTotal:  8,
		UptimeSecs: 5,
		DriverDocker: true,
	}
	die(func() error { _, err := nr.IngestHeartbeat(hb); return err }(), "IngestHeartbeat#1")
	die(func() error { _, err := nr.IngestHeartbeat(hb); return err }(), "IngestHeartbeat#2(upsert)")

	tr := repository.NewThemeRepository(con)
	die(tr.CreateTheme(&models.Theme{ID: "smoke", Name: "Smoke", Description: "", Spec: []byte("{}")}), "CreateTheme")
	die(tr.AssignTheme("global", "smoke"), "AssignTheme")
	die(tr.AssignTheme("auth", "smoke"), "AssignTheme#2")

	ir := repository.NewInstanceRepository(con)
	instID, err := ir.Create(&models.Instance{Name: "smoke-inst", Kind: "docker", NodeID: node.ID, OwnerID: 1})
	die(err, "InstanceCreate", )
	sr := repository.NewSecretRepository(con)
	die(func() error { _, err := sr.Set(instID, "K", "v", true, ""); return err }(), "SecretSet#1")
	die(func() error { _, err := sr.Set(instID, "K", "v2", true, ""); return err }(), "SecretSet#2(upsert)")

	ar := repository.NewAuthorityRepository(con)
	die(ar.Save(`{"smtp":{"enabled":false}}`), "AuthoritySave")

	ur := repository.NewUserAuthRepository(con)
	die(ur.SaveForUser(1, `{"totp":true}`), "UserAuthSave")

	rr := repository.NewRoleAuthRepository(con)
	die(rr.SetRoleAllowedProviders(1, map[string]bool{"password": true}), "RoleAuthSave")

	fmt.Println("SMOKE OK on", os.Args[1])
}
