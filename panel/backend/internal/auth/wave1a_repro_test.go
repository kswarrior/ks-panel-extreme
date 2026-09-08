package auth

import "testing"

func TestWave1AEmptyPersonalInfo(t *testing.T) {
	pw := "Xy9!Qw2#Er4$Ty7&"
	policy := DefaultPasswordPolicy()
	if err := ValidatePassword(pw, policy, ""); err != nil {
		t.Logf("BUG_REPRO empty info rejects strong pw: %v", err)
	} else {
		t.Logf("OK empty info ignored")
	}
	if err := ValidatePassword(pw, policy); err != nil {
		t.Fatalf("no-info should pass, got %v", err)
	}
	// Fail the test when bug present so BEFORE=FAIL, AFTER=PASS
	if err := ValidatePassword(pw, policy, ""); err != nil {
		t.Fatalf("BUG: empty personal-info should be ignored, got %v", err)
	}
}
