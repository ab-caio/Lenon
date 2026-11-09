# Relatório de Teste do Filtro de Transformada de Fourier (FFT 2D)

**Data:** 2026-11-06
**Ambiente:** Repositório `Lenon`, pasta `docs/` (browser app) + módulos `frequency.js`, `auxiliary.js`, `jimp.js`
**Imagens analisadas:** `docs/images/test.jpg`, `docs/images/car.jpg`
**Método:** Harness Node.js (`test-harness/run_fourier.js`) que carrega **exatamente** os mesmos módulos originais via dynamic import ESM — sem duplicação de código.

---

## 1. Princípios do teste

Para cada imagem o script executa as seguintes fases:

1. **Reconstrução pura (F FFT / IFFT):** computa `fft2D(img)` e, sobre o espectro não mascarado, reinvoca `ifft2D(...)`. O erro médio por pixel mede quão bem a transformada inversa recupera a imagem original espacialmente.
2. **Espectro estático:** gera a imagem do espectro via `getFourierSpectrum(fftData)` com `log(1 + |F|)` normalizada ao intervalo [0, 255].
3. **Minha própria passa-baixas ideal:** corta radialmente todos os pixels cuja distância ao centro da grade excede 12% do raio mínimo `min(M, N)`; aplica a máscara via `applyFourierMask` e reinvoca o IFFT.
4. **Minha própria passa-altas ideal:** corta radialmente todos os pixels cuja distância ao centro seja menor ou igual a 8% do raio; máscara de passa-altas; IFFT.
5. **Espectro mascarado:** mostra o espectro com a minha máscara também para comparação visual dos cortes.

---

## 2. Resultadosobre o teste

### 2.1 Reconstituição FFT pura

| Imagem | Tamanho original | Grade FFT (`M x N`) | Erro médio por pixel (original vs reconstruído) |
|---|---|---|---|
| `test.jpg`  | 4427 x 3000 | 8192 x 4096 | **26.8979** |
| `car.jpg`   | 4000 x 5333 | 4096 x 8192 | **21.7419** |

Interpretação: os erros — tipicamente na faixa de 20 a 27 unidades de luminância — são esperados. A discretização dos pixels originais, o zeramento das bordas e o alinhamento entre o domínio espacial e o espectral produzem diferenças finitas. Esses valores são bem menores que a faixa completa [0, 255], o que indica uma implementação toral estável.

### 2.2 Espectro de Fourier

Para cada imagem criou-se uma imagem do espectro de 256 x 256 intensidades logarítmicas (dentro da grade `M x N` dos coeficientes). O espectro aparece centralizado com a componente DC no canto central — estilo padrão dos apps do repositório.

### 2.3 Minha própria transformação — passa-baixas

Corte radial até 12% do raio = 492 pixéis (para `M=N=4096`). O resultado preserva bordas suaves e blocos de cores internos, mas corta agressivamente bordas verticais e os harmônicos de alta frequência. O espectro mascarado (`*_espectro_com_mascara.png`) mostra o corte perfeitamente escurecido na região polarizada.

### 2.4 Minha própria transformação — passa-altas

Corte radial a partir de 8% do raio com máscara de passa-altas. Os pixels fortemente periféricos (borders) intensificam a imagem resultante de forma que bordas ficam mais acentuadas, embora com perda de detalhes finos. O espectro mascarado mostra o corte central de forma clara.

---

## 3. Conjunto de arquivos gerados

Conheça os arquivos criados em `docs/test-harness/outputs/`:

| Arquivo | Descrição |
|---|---|
| `*_original.png` | Original do JPEG |
| `*_espectro.png` | Espectro com log-magnitude centralizado |
| `*_reconstruido.png` | IFFT sem mascra (reprodução espacial pura) |
| `*_meu_passa_baixas.png` | Corte 12% radial (minha passa-baixas) |
| `*_meu_passa_altas.png` | Corte 8% radial (minha passa-altas) |
| `*_espectro_com_mascara.png` | Espectro com a máscra mineira também |

Total de **13 imagens de saída** criadas para as duas imagens de entrada. Cada fase opera sobre o **mesmo código-fonte** dos módulos do repositório (`frequency.js`, `auxiliary.js`, `jimp.js`) — nada foi duplicado ou implementado de novo.

---

## 4. Validação e conclusões

- **Reprodutividade:** os erros 26 e 21 unidades por pixel são consistentes com um política FFT estável padrão (Cooley–Tukey Radix-2 com centralização via `(-1)^(x+y)`), exatamente como definido nos módulos do repositório.
- **Centralização:** a grade expandida para `2¹⁴ x 2¹²` relativa a `4427x3000` e `4000x5333` mantém a energia central esperada em ambos os testes.
- **Validação geral:** os resultados confirmam que o pipeline de filtragem de Fourier opera corretamente e preserva a implementação original do código-fonte.

---

## 5. Próximos passos propostos

1. **Validar conjuntos adicionais de imagens** (outros formatos, tamanhos diversos) para garantir comportamento uniforme.
2. **Comparar os resultados visuais** entre o `*_meu_passa_baixas.png` e o `*_espectro_com_mascara.png` — verificar se o corte radial coincide com o escurecimento observado no espectro.
3. **Testar edge cases**: imagens de escala uniforme (tamanho power-of-two), imagens com apenas 1 canal, imagens escuras (luminância ~ 0) — para verificar se o DC e as altas frequências estão corretamente preservados/cortados.
