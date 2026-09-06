package main

import (
	"database/sql"
	"fmt"
	"os"

	"github.com/example/kspanel/internal/repository"
	_ "modernc.org/sqlite"
)

func check(err error, label string) {
	if err != nil {
		fmt.Println("FAIL:", label, err)
		os.Exit(1)
	}
	fmt.Println("ok:", label)
}

func main() {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		panic(err)
	}
	_, err = db.Exec(`CREATE TABLE panel_pages (
	    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE,
	    name TEXT NOT NULL DEFAULT '', icon_svg TEXT NOT NULL DEFAULT '',
	    content_type TEXT NOT NULL DEFAULT 'markdown',
	    content TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
	    roles TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
	    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
	if err != nil {
		panic(err)
	}
	r := repository.NewPanelPageRepository(db)

	p1, err := r.Create(repository.PanelPageInput{
		Slug: "about", Name: "About", ContentType: "markdown",
		Content: "# Hello", Enabled: true,
	})
	check(err, "create about (all roles)")

	_, err = r.Create(repository.PanelPageInput{Slug: "About", Name: "dup"})
	fmt.Println("dup-slug rejected:", err != nil)

	p2, err := r.Create(repository.PanelPageInput{
		Slug: "staff-docs", Name: "Staff Docs", ContentType: "html",
		Content: "<h1>x</h1>", Enabled: true, RoleIDs: []int64{1, 2},
	})
	check(err, "create staff-docs (roles 1,2)")

	if err := repository.ValidatePanelPageSlug("Bad Slug!"); err == nil {
		fmt.Println("FAIL: bad slug accepted")
		os.Exit(1)
	}
	fmt.Println("ok: bad slug rejected")

	nav99, err := r.ListNav(99)
	check(err, "nav for role 99")
	if len(nav99) != 1 || nav99[0].Slug != "about" {
		fmt.Println("FAIL: role 99 should see only about, got", nav99)
		os.Exit(1)
	}
	fmt.Println("ok: role 99 sees only about")

	nav1, _ := r.ListNav(1)
	if len(nav1) != 2 {
		fmt.Println("FAIL: role 1 should see 2 pages, got", len(nav1))
		os.Exit(1)
	}
	fmt.Println("ok: role 1 sees both pages")

	upd, err := r.Update(p2.ID, repository.PanelPageInput{
		Slug: "staff-docs", Name: "Staff Docs", ContentType: "html",
		Content: "<h1>x</h1>", Enabled: false, RoleIDs: []int64{1},
	})
	check(err, "disable staff-docs")
	if upd.Enabled {
		fmt.Println("FAIL: still enabled")
		os.Exit(1)
	}
	nav1b, _ := r.ListNav(1)
	if len(nav1b) != 1 {
		fmt.Println("FAIL: disabled page still in nav")
		os.Exit(1)
	}
	fmt.Println("ok: disabled page hidden from nav")

	got, err := r.GetBySlug("about")
	check(err, "get by slug")
	if got.ID != p1.ID || got.Content != "# Hello" {
		fmt.Println("FAIL: wrong page content")
		os.Exit(1)
	}
	fmt.Println("ok: content round-trips")

	check(r.Delete(p1.ID), "delete about")
	if _, err := r.Get(p1.ID); err == nil {
		fmt.Println("FAIL: deleted page still readable")
		os.Exit(1)
	}
	fmt.Println("ok: deleted page gone")
	fmt.Println("ALL PANEL-PAGES SMOKE TESTS PASSED")
}
