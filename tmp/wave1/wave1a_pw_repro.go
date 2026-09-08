package main

import (
	"fmt"
	"github.com/example/kspanel/internal/auth"
)

func main() {
	pw := "Xy9!Qw2#Er4$Ty7&"
	policy := auth.DefaultPasswordPolicy()
	errEmpty := auth.ValidatePassword(pw, policy, "")
	errNoInfo := auth.ValidatePassword(pw, policy)
	fmt.Printf("pw=%q len=%d\n", pw, len(pw))
	fmt.Printf("with empty info err=%v\n", errEmpty)
	fmt.Printf("with no info err=%v\n", errNoInfo)
	if errEmpty != nil {
		fmt.Printf("BUG_REPRO: empty personal-info rejects strong password\n")
	} else {
		fmt.Printf("OK: empty info ignored\n")
	}
}
