package handlers

import (
	"encoding/json"
	"testing"

	"github.com/example/kspanel/internal/pagelib"
)

// TestShippedYamlLibraryPassesValidation runs every page in the shipped
// library (instance_pages/pages/*.yaml, embedded fallback) through the exact
// import gate used by the file/URL/marketplace/local endpoints: YAML decode
// -> request mapping -> validateInstancePage. A library file that fails here
// would 400 on every import path.
func TestShippedYamlLibraryPassesValidation(t *testing.T) {
	names := pagelib.ListNames()
	if len(names) == 0 {
		t.Fatal("page library is empty")
	}
	for _, name := range names {
		data, ok := pagelib.Read(name)
		if !ok {
			t.Errorf("ListNames returned unreadable %q", name)
			continue
		}
		var pageReq ImportInstancePageRequest
		if err := decodeInstancePageBytes(data, &pageReq); err != nil {
			t.Errorf("%s: decode failed: %v", name, err)
			continue
		}
		dto := instancePageDTO{
			Name:            pageReq.Name,
			Slug:            pageReq.Slug,
			Kind:            pageReq.Kind,
			Category:        pageReq.Category,
			Type:            pageReq.Type,
			Description:     pageReq.Description,
			ContentType:     pageReq.ContentType,
			ContentHTML:     pageReq.ContentHTML,
			ContentMarkdown: pageReq.ContentMarkdown,
			ContentBlocks:   pageReq.ContentBlocks,
			SourceTSX:       pageReq.SourceTSX,
			BundleCSS:       pageReq.BundleCSS,
			IconSVG:         pageReq.IconSVG,
			IconColor:       pageReq.IconColor,
			Actions:         pageReq.Actions,
			SubPages:        pageReq.subPagesJSON(),
			Components:      pageReq.Components,
			Configure:       pageReq.configureJSON(),
		}
		if _, err := validateInstancePage(dto); err != nil {
			t.Errorf("%s: validation failed: %v", name, err)
		}
	}
}

// TestDecodeInstancePageBytesAcceptsYAMLAndLegacyJSON locks in that both
// encodings decode to the same request: native YAML lists land where the
// JSON string-encoded form lands.
func TestDecodeInstancePageBytesAcceptsYAMLAndLegacyJSON(t *testing.T) {
	yamlDoc := "name: Demo\nslug: demo\ncontent_type: html\n" +
		"content_html: |\n  <div>hi</div>\n" +
		"actions:\n- name: ping\n  type: shell\n  command: echo pong\n"
	jsonDoc := `{"name":"Demo","slug":"demo","content_type":"html",` +
		`"content_html":"<div>hi</div>\n",` +
		`"actions":"[{\"name\":\"ping\",\"type\":\"shell\",\"command\":\"echo pong\"}]"}`

	var fromYAML, fromJSON ImportInstancePageRequest
	if err := decodeInstancePageBytes([]byte(yamlDoc), &fromYAML); err != nil {
		t.Fatalf("YAML decode failed: %v", err)
	}
	if err := decodeInstancePageBytes([]byte(jsonDoc), &fromJSON); err != nil {
		t.Fatalf("JSON decode failed: %v", err)
	}
	if fromYAML.Name != "Demo" || fromYAML.Slug != "demo" || fromYAML.ContentHTML != "<div>hi</div>\n" {
		t.Errorf("unexpected YAML request: %+v", fromYAML)
	}
	var yamlActions, jsonActions []map[string]any
	if err := json.Unmarshal([]byte(fromYAML.Actions), &yamlActions); err != nil {
		t.Fatalf("YAML actions not a JSON array: %v", err)
	}
	if err := json.Unmarshal([]byte(fromJSON.Actions), &jsonActions); err != nil {
		t.Fatalf("JSON actions not a JSON array: %v", err)
	}
	if len(yamlActions) != 1 || len(jsonActions) != 1 ||
		yamlActions[0]["name"] != "ping" || jsonActions[0]["name"] != "ping" ||
		yamlActions[0]["command"] != "echo pong" || jsonActions[0]["command"] != "echo pong" {
		t.Errorf("encoding mismatch:\nYAML %s\nJSON %s", fromYAML.Actions, fromJSON.Actions)
	}
}
