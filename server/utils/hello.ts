export function makeGreeting() {
  return `Hello, ${getRandomName()}!`
}

const getRandomName = () => {
  const names = ['Buonarroti', 'Da Vinci', 'di Niccolò di Betto Bardi', 'Sanzio'] as const
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return names[array[0]! % names.length]
}
