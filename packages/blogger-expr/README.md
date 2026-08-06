# blogger-expr

Parser and evaluator for Blogger theme XML expressions.

## Compatibility

Blogger does not provide an official specification or grammar for its XML expression language. Consequently, this project has been developed by carefully observing Blogger's behavior through extensive experimentation, reverse engineering, and trial and error.

The parser and evaluator are designed to be as compatible with Blogger as possible and have been tested against hundreds of real-world expressions extracted from production Blogger themes (i.e. Plus UI). Many undocumented language features and edge cases are supported where their behavior could be reliably determined.

However, **100% compatibility cannot be guaranteed**. Blogger's implementation is proprietary, undocumented, and may change without notice. Some expressions may behave differently, particularly if they depend on undocumented quirks, parser bugs, or implementation details that have not yet been identified.

If you discover an expression that behaves differently from Blogger, please open an issue with a minimal reproducible example. Compatibility improvements are always welcome.
