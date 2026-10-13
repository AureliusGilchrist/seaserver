package core

import (
	"errors"
	"testing"

	"github.com/rs/zerolog"
)

func TestFirstProfileIsAdmin(t *testing.T) {
	logger := zerolog.Nop()
	pm, err := NewProfileManager(t.TempDir(), &logger)
	if err != nil {
		t.Fatalf("create profile manager: %v", err)
	}
	defer func() {
		db, err := pm.db.DB()
		if err == nil {
			_ = db.Close()
		}
	}()

	profile, err := pm.CreateProfileForAdmin("First", "1234", false, false)
	if err != nil {
		t.Fatalf("create first profile: %v", err)
	}
	if !profile.IsAdmin {
		t.Fatal("first profile was not made an admin")
	}
	if _, err := pm.CreateProfileForAdmin("Second", "5678", true, false); !errors.Is(err, ErrProfileAdminRequired) {
		t.Fatalf("expected unauthenticated additional profile creation to be denied, got %v", err)
	}
}

func TestNewProfileManagerPromotesEarliestProfileWhenNoAdminsExist(t *testing.T) {
	dataDir := t.TempDir()
	logger := zerolog.Nop()
	pm, err := NewProfileManager(dataDir, &logger)
	if err != nil {
		t.Fatalf("create profile manager: %v", err)
	}
	defer func() {
		db, err := pm.db.DB()
		if err == nil {
			_ = db.Close()
		}
	}()

	first, err := pm.CreateProfile("First", "1234", true)
	if err != nil {
		t.Fatalf("create first profile: %v", err)
	}
	if _, err := pm.CreateProfile("Second", "5678", false); err != nil {
		t.Fatalf("create second profile: %v", err)
	}
	if err := pm.db.Model(&Profile{}).Where("id > 0").Update("is_admin", false).Error; err != nil {
		t.Fatalf("remove admin roles to simulate an older database: %v", err)
	}
	db, err := pm.db.DB()
	if err != nil {
		t.Fatalf("get profiles database: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close profiles database: %v", err)
	}

	pm, err = NewProfileManager(dataDir, &logger)
	if err != nil {
		t.Fatalf("reopen profile manager: %v", err)
	}
	defer func() {
		db, err := pm.db.DB()
		if err == nil {
			_ = db.Close()
		}
	}()

	profiles, err := pm.GetAllProfiles()
	if err != nil {
		t.Fatalf("list profiles: %v", err)
	}
	if len(profiles) != 2 || profiles[0].ID != first.ID || !profiles[0].IsAdmin || profiles[1].IsAdmin {
		t.Fatalf("expected only the earliest profile to be promoted, got %+v", profiles)
	}
}

func TestCannotDemoteLastAdmin(t *testing.T) {
	logger := zerolog.Nop()
	pm, err := NewProfileManager(t.TempDir(), &logger)
	if err != nil {
		t.Fatalf("create profile manager: %v", err)
	}
	defer func() {
		db, err := pm.db.DB()
		if err == nil {
			_ = db.Close()
		}
	}()

	admin, err := pm.CreateProfile("Admin", "1234", true)
	if err != nil {
		t.Fatalf("create admin profile: %v", err)
	}
	if _, err := pm.UpdateProfile(admin.ID, map[string]interface{}{"is_admin": false}); err == nil {
		t.Fatal("expected demoting the last admin to fail")
	}
}
