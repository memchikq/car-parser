import fetch from "node-fetch"
import { load } from "cheerio"
import buffer from "buffer"
import fs from "fs"
import path from "path"

async function getDefaulData() {
  try {
    const response = await fetch("https://gruzovoy.ru/catalog")
    const bufferResponse = await response.arrayBuffer()
    const bf = buffer.Buffer.from(bufferResponse)
    const decoder = new TextDecoder("utf-8")
    const decodedHtml = decoder.decode(bf)

    return decodedHtml
  } catch (e) {
    throw new Error(e.message)
  }
}
async function delayedLoopWithGenerator() {
  let count = 0
  const listData = { list: "" }
  let carsModels: { id: string; value: string; label: string }[] = []
  let brands: {
    typeValue: string
    typeId: string
    brands: { id: string; value: string; label: string }[]
  }[] = []
  let marks:{typeUrl:string,brandId:string,marks:{ id: string; value: string; label: string }[]}[] = []
  async function parseHtml() {
    let loadData = await getDefaulData()

    const $ = load(loadData)
    const typeCar: { id: string; value: string; label: string }[] = []

    $("div.select.type select optgroup option").each((index, element) => {
      //   const article = {}
      const id = $(element).attr("value")
      const value = $(element).attr("data-url")
      const label = $(element).text()
      // @ts-ignore
      typeCar.push({ id, value, label })
    })
    return typeCar
  }
  carsModels = await parseHtml()
  fs.writeFileSync(
    `${path.join("./", "types.json")}`,
    JSON.stringify(carsModels, null, 2),
    "utf-8"
  )
  async function fetchData(id: string, value: string) {
    const formData = new FormData()
    formData.append("id", id)
    const response = await fetch(`https://gruzovoy.ru/catalog/ajax/brands`, {
      body: formData,
      method: "POST",
    })
    if (response.ok) {
      const bufferResponse = await response.arrayBuffer()
      const bf = buffer.Buffer.from(bufferResponse)
      const decoder = new TextDecoder("utf-8")
      const decodedHtml = decoder.decode(bf)

      return { decodedHtml, id, value }
    }
  }
  async function fetchDataCarMark(type_url: string, brand_url: string) {
    const formData = new FormData()
    formData.append("type_url", type_url)
    formData.append("brand_url", brand_url)
    const response = await fetch(`https://gruzovoy.ru/catalog/ajax/vehicle`, {
      body: formData,
      method: "POST",
    })
    if (response.ok) {
      const bufferResponse = await response.arrayBuffer()
      const bf = buffer.Buffer.from(bufferResponse)
      const decoder = new TextDecoder("utf-8")
      const decodedHtml = decoder.decode(bf)

      return { decodedHtml, brand_url,type_url }
    }
  }
  // использую генераторы для удобного получения данных частями, и задержка чтобы не DDOS'ить api
  async function* generator() {
    for (let i = 0; i < carsModels.length; i++) {
      
      const data = await fetchData(carsModels[i]?.id, carsModels[i].value)
      yield data
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
  for await (const data of generator()) {
    if (data) {
      const $ = load(data.decodedHtml)
      $("optgroup").each((index, element) => {
        $(element)
          .find("option")
          .each((i, option) => {
            const id = $(option).attr("value")
            const label = $(option).attr("title")
            const value = $(option).attr("data-url")
            const brandIndex = brands.findIndex((v) => v.typeId == data.id)
            if (brandIndex !== -1) {
              // @ts-ignore
              brands[brandIndex].brands.push({ id, id, label, value })
            } else {
              brands[brands.length] = {
                typeValue: data.value,
                typeId: data.id,
                // @ts-ignore
                brands: [{ id, label, value }],
              }
            }
          })
        
        // console.log(brands)
      })
    }
  }
  console.log("Бренды загружены")
  fs.writeFileSync(
    `${path.join("./", "brands.json")}`,
    JSON.stringify(brands, null, 2),
    "utf-8"
  )
  async function* generatorCarMark() {
    for (let i = 0; i < brands.length; i++) {
      for (let j = 0; j < brands[i].brands.length; j++) {
        try{

          const data = await fetchDataCarMark(
            brands[i].typeValue,
            brands[i].brands[j].value
          )
          yield data
        }
        catch(e){
          console.error(`Error fetching data for ${brands[i].typeValue} - ${brands[i].brands[j].value}:`, e);
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
  }
  
  for await (const data of generatorCarMark()) {
    if(data){
        const $ = load(data.decodedHtml)
        $("optgroup").each((index,element)=>{

          $(element).find("option").each((i,option)=>{
            const value = $(option).attr("value")
            const id = $(option).attr("value")
            const label = $(option).attr("title")
            
            const markIndex =marks.findIndex(v=> v.brandId == data.brand_url && data.type_url == v?.typeUrl)
            if(markIndex!== -1){
              if(marks[markIndex].marks.findIndex(v=> v.id == id) == -1){
                // @ts-ignore
                marks[markIndex].marks.push({id,label,value})
              }
            }
            else{
              // @ts-ignore
              marks[marks.length] = {typeUrl:data.type_url,brandId:data.brand_url,marks:[{id,label,value}]}
            }
          })
          
          // console.log(brands)
        })
    }
  
}
console.log("Марки загружены!")
fs.writeFileSync(`${path.join('./','marks.json')}`, JSON.stringify(marks,null,2), 'utf-8');
}
delayedLoopWithGenerator()
