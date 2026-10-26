package models
import (
 "encoding/json"
 "testing"
)
func TestDebugDeps(t *testing.T){
 x:=&Mod{ID:3,Slug:"x",Version:"1.0.0",Active:true,Manifest:json.RawMessage(`{"apiVersion":3,"requires":{"y":"*"}}`)}
 y:=&Mod{ID:4,Slug:"y",Version:"1.0.0",Active:true,Manifest:json.RawMessage(`{"apiVersion":3,"requires":{"x":"*"}}`)}
 for _,m:=range []*Mod{x,y}{ man:=ParseV2Manifest(m.Manifest); t.Logf("%s req=%+v direct=%+v",m.Slug,man.Requires,CheckDependencies(m,[]*Mod{x,y},true)) }
 ordered,blocked:=SortModsByDependency([]*Mod{x,y})
 t.Logf("ordered=%v blocked=%+v",ordered,blocked)
}
