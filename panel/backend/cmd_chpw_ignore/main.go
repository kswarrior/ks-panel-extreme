package main
import ("database/sql";"fmt";_ "modernc.org/sqlite";"github.com/example/kspanel/internal/auth")
func main(){
  db,_:=sql.Open("sqlite","/tmp/testpanel.db")
  h,_:=auth.HashPassword("admin1234")
  fmt.Println("h:",string(h)[:40])
  _,err:=db.Exec("UPDATE users SET password_hash=? WHERE username='admin'",h)
  fmt.Println("err:",err)
  db.Close()
}
