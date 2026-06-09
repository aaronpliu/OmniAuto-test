enum pooltype {
    WIN = '',
    PLA = 'PLA'
}


const p = pooltype.WIN || pooltype.PLA
console.log(p)

