---
"blogger-hbs": patch
---

Expressions are checked as Blogger checks them, with `blogger-expr`: besides their syntax, a theme is refused for what Blogger would not accept, the type of an operand (`[1] - 1`), a condition that is not one (`5 ? a : b`), an expression that costs more than 40, a range anywhere but the whole `b:loop values`. Formatting prints an expression on one line with `blogger-expr`, keeping how it is spelled, `&&` and `eq` included, and its parentheses. What is accepted but may not do what it looks like is a warning, where it is in the expression, in the formatted theme too, and with how to fix it: ``Expression in the attribute 'cond' of <b:if>: `data:x` may not be text. Fix: turn it into text where it is used: (data:x + "")``
