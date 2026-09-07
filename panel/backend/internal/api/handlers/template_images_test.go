package handlers

import (
	"strings"
	"testing"
)

func imagesSpec() map[string]any {
	return map[string]any{
		"images": []any{
			map[string]any{"name": "Java 21", "image": "eclipse-temurin:21-jre", "description": "LTS, default", "default": true, "env": map[string]any{"JAVA_VERSION": "21"}},
			map[string]any{"name": "Java 17", "image": "eclipse-temurin:17-jre"},
		},
	}
}

func TestValidateTemplateSpecImagesOK(t *testing.T) {
	if err := validateTemplateSpec(imagesSpec()); err != nil {
		t.Fatalf("valid images rejected: %v", err)
	}
}

func TestValidateTemplateSpecImagesDockerMapOK(t *testing.T) {
	spec := map[string]any{"docker_images": map[string]any{"Java 17": "eclipse-temurin:17-jre", "Java 21": "eclipse-temurin:21-jre"}}
	if err := validateTemplateSpec(spec); err != nil {
		t.Fatalf("valid docker_images rejected: %v", err)
	}
}

func TestValidateTemplateSpecImagesDupAcrossShapes(t *testing.T) {
	spec := map[string]any{
		"images":        []any{map[string]any{"name": "Java 21", "image": "eclipse-temurin:21-jre"}},
		"docker_images": map[string]any{"java 21": "other:tag"},
	}
	if err := validateTemplateSpec(spec); err == nil {
		t.Fatalf("cross-shape duplicate name accepted")
	}
}

func TestValidateTemplateSpecImagesTwoDefaults(t *testing.T) {
	spec := map[string]any{"images": []any{
		map[string]any{"name": "A", "image": "a:1", "default": true},
		map[string]any{"name": "B", "image": "b:1", "default": true},
	}}
	if err := validateTemplateSpec(spec); err == nil {
		t.Fatalf("two defaults accepted")
	}
}

func TestValidateTemplateSpecImagesBadEntries(t *testing.T) {
	cases := []map[string]any{
		{"images": "nope"},
		{"images": []any{"nope"}},
		{"images": []any{map[string]any{"image": "x:1"}}},                       // missing name
		{"images": []any{map[string]any{"name": "A"}}},                          // missing image
		{"images": []any{map[string]any{"name": "A", "image": "x\n:1"}}},        // newline image
		{"images": []any{map[string]any{"name": "A", "image": "x:1", "default": "yes"}}}, // non-bool default
		{"images": []any{map[string]any{"name": "A", "image": "x:1", "env": "nope"}}},     // non-object env
		{"images": []any{map[string]any{"name": "A", "image": "x:1", "env": map[string]any{"1BAD": "v"}}}}, // bad env key
		{"images": []any{map[string]any{"name": "A", "image": "x:1", "env": map[string]any{"OK": "a\nb"}}}}, // newline env value
		{"docker_images": "nope"},
		{"docker_images": map[string]any{"A": ""}},
		{"docker_images": map[string]any{"A": 42}},
		{"default_image": 42},
		{"images": []any{map[string]any{"name": "A", "image": "a:1"}}, "default_image": "ghost"},
		{"images": []any{
			map[string]any{"name": "A", "image": "a:1", "default": true},
			map[string]any{"name": "B", "image": "b:1"},
		}, "default_image": "B"}, // conflicts with default:true entry
	}
	for i, spec := range cases {
		if err := validateTemplateSpec(spec); err == nil {
			t.Errorf("case %d accepted: %v", i, spec)
		}
	}
}

func TestValidateTemplateSpecImagesTooMany(t *testing.T) {
	many := make([]any, 0, 33)
	for i := 0; i < 33; i++ {
		many = append(many, map[string]any{"name": string(rune('A' + i%26)) + string(rune('0'+i/26)), "image": "x:1"})
	}
	if err := validateTemplateSpec(map[string]any{"images": many}); err == nil {
		t.Fatalf("oversized images accepted")
	}
}

func TestResolveDeployImageLegacy(t *testing.T) {
	got, err := resolveDeployImage(nil, "", "nginx:alpine", "")
	if err != nil || got.Image != "nginx:alpine" {
		t.Fatalf("legacy fallback broken: %v %v", got, err)
	}
}

func TestResolveDeployImageDefaultAndKey(t *testing.T) {
	entries, def, err := parseTemplateImages(imagesSpec())
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	got, err := resolveDeployImage(entries, def, "eclipse-temurin:21-jre", "")
	if err != nil || got.Image != "eclipse-temurin:21-jre" || got.Name != "Java 21" {
		t.Fatalf("default pick wrong: %v %v", got, err)
	}
	if got.Env["JAVA_VERSION"] != "21" {
		t.Fatalf("per-image env lost: %v", got.Env)
	}
	// Case-insensitive key match.
	got, err = resolveDeployImage(entries, def, "eclipse-temurin:21-jre", "  java 17 ")
	if err != nil || got.Image != "eclipse-temurin:17-jre" {
		t.Fatalf("key pick wrong: %v %v", got, err)
	}
	// Unknown key fails closed and names the options.
	_, err = resolveDeployImage(entries, def, "eclipse-temurin:21-jre", "Java 8")
	if err == nil || !strings.Contains(err.Error(), "Java 21") {
		t.Fatalf("unknown key must fail with options, got: %v", err)
	}
}

func TestResolveDeployImageDefaultImageName(t *testing.T) {
	spec := map[string]any{
		"images": []any{
			map[string]any{"name": "A", "image": "a:1"},
			map[string]any{"name": "B", "image": "b:1"},
		},
		"default_image": "B",
	}
	entries, def, err := parseTemplateImages(spec)
	if err != nil {
		t.Fatalf("parse failed: %v", err)
	}
	got, err := resolveDeployImage(entries, def, "a:1", "")
	if err != nil || got.Name != "B" {
		t.Fatalf("default_image pick wrong: %v %v", got, err)
	}
}

func TestMergeManifestImagesIntoSpec(t *testing.T) {
	specMap := map[string]any{}
	manifest := map[string]any{
		"docker_images": map[string]any{"Java 17": "eclipse-temurin:17-jre"},
		"name":          "x",
	}
	if !mergeManifestImagesIntoSpec(specMap, manifest) {
		t.Fatalf("expected a move")
	}
	if _, ok := specMap["docker_images"]; !ok {
		t.Fatalf("docker_images not lifted")
	}
	if err := validateTemplateSpec(specMap); err != nil {
		t.Fatalf("lifted spec invalid: %v", err)
	}
	// Never clobber a spec that already defines images.
	owned := map[string]any{"images": []any{map[string]any{"name": "A", "image": "a:1"}}}
	if mergeManifestImagesIntoSpec(owned, manifest) {
		t.Fatalf("must not overwrite existing images")
	}
}
