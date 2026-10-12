---
name: seo-audit
description: >-
  Dùng khi rà hoặc sửa SEO kỹ thuật của vanphatcompany.vn: robots.txt,
  sitemap.xml, canonical, title, description, Open Graph, schema.org, link gãy,
  alt ảnh, dung lượng trang. Sửa bằng pull request, ưu tiên generator.
---

# Rà SEO kỹ thuật

Site: https://vanphatcompany.vn. Làm trên nhánh, mở PR, không push `main`. Trang SKU, nhóm và lĩnh vực do `scripts/generate_catalog_pages.py` sinh. Sửa generator rồi chạy lại, đừng tay sửa hàng trăm file HTML vì lần sync sau ghi đè. Trang tĩnh (`index.html`, `san-pham.html`, `photocopy.html`, `lien-he.html`, `khu-vuc.html`, `thu-ngo.html`) sửa tại file đó; generator chỉ làm mới phần chrome chung.

Giữ meta `google-site-verification` đang có trên trang chủ. Không ghi đè `CNAME`. Không thêm «Đặt hàng online». Mã nhóm `Không đưa lên web` không được lọt vào sitemap hay trang index.

Sau khi sửa catalog, chạy `python3 scripts/generate_catalog_pages.py` nếu chỉ đổi JSON, hoặc sync script nếu đổi từ Excel, rồi:

```bash
python3 scripts/check_rules.py
python3 scripts/check_seo.py
```

`scripts/check_seo.py` là lượt SEO kỹ thuật: robots, sitemap, canonical, title, description, Open Graph, Twitter, hreflang, schema Organization trên trang chủ, schema Product trên trang SKU, alt, link nội bộ, và HTML quá 500 KB. Workflow `.github/workflows/seo-audit.yml` chạy lệnh này trên mọi PR và một lượt nữa khi push lên `main`. Lượt trên `main` đỏ thì mở PR sửa, không sửa thẳng `main`. Workflow không deploy Pages.

Search Console và Semrush làm sau khi site đã lên, theo `docs/SEO-SEMRUSH.md`. Không nhét tài khoản Semrush vào repo. Codeword để gọi việc này là `rà seo`.

## Hạng mục

**robots.txt.** `User-agent: *` và `Allow: /`. Dòng `Sitemap: https://vanphatcompany.vn/sitemap.xml`. Không chặn `/san-pham/` hay `/linh-vuc/`. `nhan-vien.html` giữ `noindex, nofollow` và không có trong sitemap.

**sitemap.xml.** Mỗi `loc` là URL tuyệt đối `https://vanphatcompany.vn/...`, trỏ tới file thật trong repo (trang chủ là `index.html`). Có lĩnh vực, nhóm, SKU đang bán. Không có mã bị loại, không có sổ nhân viên. Sinh bằng generator, không sửa tay từng URL.

**Canonical.** Mỗi trang một `link rel="canonical"` tuyệt đối, trùng URL muốn Google giữ (trang SKU tĩnh, không phải `san-pham.html?q=`). `hreflang="vi"` trỏ cùng URL đó.

**Title và description.** Có đủ, unique theo trang. Title khoảng dưới 70 ký tự (`TITLE_MAX` trong generator). Description khoảng dưới 160 ký tự, có tên hàng hoặc dịch vụ và địa bàn khi hợp, không nhồi từ khóa. Không để title trang chủ trên trang SKU.

**Open Graph.** `og:locale` `vi_VN`, `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url` (trùng canonical), `og:image` tuyệt đối, `og:image:alt`. Twitter card `summary_large_image`. Ảnh chia sẻ mặc định là `assets/og.jpg` khi trang không có ảnh sản phẩm. Trang SKU dùng ảnh sản phẩm nếu có.

**schema.org.** Trang chủ: `Organization` / `LocalBusiness` và `WebSite`, đúng tên và địa chỉ đang public, `SearchAction` trỏ `san-pham.html?q=`. Trang SKU: `Product` với `name`, `sku`, `image`, `description`, breadcrumb; `Offer` chỉ khi có giá niêm yết thật. Không bịa review, điểm sao, hay tồn kho để lấy rich result.

**Link gãy.** Với HTML trong repo, lấy `href` và `src` tương đối. Bỏ qua `http`, `mailto`, `tel`, `javascript`, `data`. Ghép với thư mục của file rồi kiểm file tồn tại. `sitemap` từng `loc` cũng phải có file. Anchor chỉ trên cùng trang thì bỏ qua.

**Alt ảnh.** Mọi `img` có attribute `alt`. Ảnh sản phẩm dùng tên sản phẩm. Ảnh trang trí được `alt=""`, nhưng attribute phải có. Không để tên file làm alt.

**Dung lượng.** Không thêm framework hay ảnh không nén. Ảnh sản phẩm Drive đã đi qua helper kích thước trong generator; hero có `width`/`height`, ảnh dưới màn hình đầu `loading="lazy"`. Nếu một trang HTML vượt khoảng 500 KB vì nhét base64, gỡ base64. Font Be Vietnam Pro giữ cách nạp không chặn LCP đang có (`display=optional`, media print).

## Cách báo trong PR

Liệt kê từng hạng mục: đạt, hoặc lỗi và file đã sửa. Nếu chỉ đề xuất Search Console thì nói đó là việc sau merge, không gắn credential.
