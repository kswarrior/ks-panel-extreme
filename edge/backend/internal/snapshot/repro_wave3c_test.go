package snapshot

import (
	"fmt"
	"testing"
)

func TestReproDangerousLocations(t *testing.T) {
	for _, loc := range []string{"/var/spool/cron", "/tmp/snapshots", "/opt/data", "/home/u", "/srv/x", "/etc/cron.d"} {
		fmt.Printf("validateLocation(%q) err=%v\n", loc, validateLocation(loc))
	}
}
