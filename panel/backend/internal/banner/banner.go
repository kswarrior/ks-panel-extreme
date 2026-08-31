package banner

import "fmt"

// Print displays the KS Panel startup banner. The visual is small
// enough to fit on a 80-col terminal; if it ever needs to grow we'd
// rather move the brand to a settings-driven wordmark than print more
// ASCII art.
func Print() {
	banner := `
 ██╗  ██╗███████╗    ██████╗  █████╗  ███╗   ██╗███████╗██╗
 ██║ ██╔╝██╔════╝    ██╔══██╗██╔══██╗████╗  ██║██╔════╝██║
 █████╔╝ ███████╗    ██████╔╝███████║██╔██╗ ██║█████╗  ██║
 ██╔═██╗ ╚════██║    ██╔═══╝ ██╔══██║██║╚██╗██║██╔══╝  ██║
 ██║  ██╗███████║    ██║      ██║  ██║██║ ╚████║███████╗███████╗
 ╚═╝  ╚═╝╚══════╝    ╚═╝      ╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝
`
	fmt.Print(banner)
}
