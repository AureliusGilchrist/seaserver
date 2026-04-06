package plugin_ui

import (
	"seanime/internal/goja/goja_bindings"

	"github.com/dop251/goja"
)

func (c *Context) bindChromeDP(obj *goja.Object) {
	cdp := goja_bindings.NewChromeDP(c.vm)
	
	// Store instance for cleanup
	c.chromeDPInstance = cdp

	_ = obj.Set("chromeDP", cdp)

	c.registerOnCleanup(func() {
		c.logger.Debug().Msg("plugin: Terminating ChromeDP")
		cdp.Close()
	})
}
