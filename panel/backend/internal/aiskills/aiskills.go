// Package aiskills serves the per-area skill guides behind the AI
// assistant's get_docs tool. One markdown file per topic, embedded into
// the binary so answers come from versioned docs with no disk dependency.
//
// Size contract: keep every file under ~3.2KB. Tool results are capped at
// 4000 chars before they reach the model, so anything longer is cut off
// mid-playbook. TestAIDocsCoverage (handlers package) locks this: every
// topic in Topics must resolve to a 3+ sentence guide.
package aiskills

import (
	"embed"
	"strings"
)

//go:embed *.md
var files embed.FS

// Topics is the canonical get_docs topic list. It mirrors the topic enum
// in the get_docs tool definition (ai_chat_handler.go).
var Topics = []string{
	"index", "instances", "templates", "nodes", "instance_pages",
	"users", "updates", "mods", "applications", "tickets", "backups",
	"security", "database", "automation", "sftp", "themes",
	"notifications", "ai",
}

// Get returns the skill guide for a topic (case-insensitive, blank means
// the index). Unknown topics fall back to the index. ok is false only
// when even the index is missing (broken embed — loud in tests, the chat
// layer substitutes a static fallback).
func Get(topic string) (string, bool) {
	t := strings.ToLower(strings.TrimSpace(topic))
	if t == "" {
		t = "index"
	}
	raw, err := files.ReadFile(t + ".md")
	if err != nil {
		raw, err = files.ReadFile("index.md")
		if err != nil {
			return "", false
		}
	}
	return string(raw), true
}
