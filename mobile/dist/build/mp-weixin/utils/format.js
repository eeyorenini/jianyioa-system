"use strict";exports.formatNodeDateRange=function(t,e){if(!t)return"";const n=t=>{const e=new Date(t);return`${e.getMonth()+1}月${e.getDate()}日`};return e&&t!==e?`${n(t)} ~ ${n(e)}`:n(t)};
