module github.com/sapslaj/homelab-pets/shimiko

go 1.24.0

tool (
	github.com/pressly/goose/v3/cmd/goose
	github.com/spf13/cobra-cli
)

require (
	github.com/aws/aws-sdk-go-v2 v1.36.1
	github.com/aws/aws-sdk-go-v2/config v1.29.6
	github.com/aws/aws-sdk-go-v2/service/route53 v1.48.7
	github.com/bramvdbogaerde/go-scp v1.5.0
	github.com/bwesterb/go-zonefile v1.0.1
	github.com/labstack/echo/v4 v4.13.3
	github.com/ncruces/go-strftime v0.1.9
	github.com/spf13/cobra v1.8.1
	golang.org/x/crypto v0.31.0
	gorm.io/driver/sqlite v1.5.7
	gorm.io/gorm v1.25.12
)

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/ClickHouse/ch-go v0.61.5 // indirect
	github.com/ClickHouse/clickhouse-go/v2 v2.30.0 // indirect
	github.com/andybalholm/brotli v1.1.1 // indirect
	github.com/antlr4-go/antlr/v4 v4.13.0 // indirect
	github.com/aws/aws-sdk-go-v2/credentials v1.17.59 // indirect
	github.com/aws/aws-sdk-go-v2/feature/ec2/imds v1.16.28 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.3.32 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.6.32 // indirect
	github.com/aws/aws-sdk-go-v2/internal/ini v1.8.2 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.12.2 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.12.13 // indirect
	github.com/aws/aws-sdk-go-v2/service/sso v1.24.15 // indirect
	github.com/aws/aws-sdk-go-v2/service/ssooidc v1.28.14 // indirect
	github.com/aws/aws-sdk-go-v2/service/sts v1.33.14 // indirect
	github.com/aws/smithy-go v1.22.2 // indirect
	github.com/coder/websocket v1.8.12 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/elastic/go-sysinfo v1.11.2 // indirect
	github.com/elastic/go-windows v1.0.1 // indirect
	github.com/fsnotify/fsnotify v1.8.0 // indirect
	github.com/go-acme/lego/v4 v4.22.2 // indirect
	github.com/go-faster/city v1.0.1 // indirect
	github.com/go-faster/errors v0.7.1 // indirect
	github.com/go-sql-driver/mysql v1.8.1 // indirect
	github.com/golang-jwt/jwt/v4 v4.5.1 // indirect
	github.com/golang-sql/civil v0.0.0-20220223132316-b832511892a9 // indirect
	github.com/golang-sql/sqlexp v0.1.0 // indirect
	github.com/golang/protobuf v1.5.4 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/hashicorp/golang-lru/v2 v2.0.7 // indirect
	github.com/hashicorp/hcl v1.0.0 // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx/v5 v5.7.1 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	github.com/joeshaw/multierror v0.0.0-20140124173710-69b34d4ec901 // indirect
	github.com/joho/godotenv v1.5.1 // indirect
	github.com/jonboulle/clockwork v0.4.0 // indirect
	github.com/klauspost/compress v1.17.7 // indirect
	github.com/labstack/gommon v0.4.2 // indirect
	github.com/magiconair/properties v1.8.7 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-sqlite3 v1.14.22 // indirect
	github.com/mfridman/interpolate v0.0.2 // indirect
	github.com/mfridman/xflag v0.1.0 // indirect
	github.com/microsoft/go-mssqldb v1.8.0 // indirect
	github.com/mitchellh/mapstructure v1.5.0 // indirect
	github.com/paulmach/orb v0.11.1 // indirect
	github.com/pelletier/go-toml v1.9.4 // indirect
	github.com/pierrec/lz4/v4 v4.1.21 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/pressly/goose/v3 v3.24.1 // indirect
	github.com/prometheus/procfs v0.12.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	github.com/segmentio/asm v1.2.0 // indirect
	github.com/sethvargo/go-retry v0.3.0 // indirect
	github.com/shopspring/decimal v1.4.0 // indirect
	github.com/spf13/afero v1.11.0 // indirect
	github.com/spf13/cast v1.6.0 // indirect
	github.com/spf13/cobra-cli v1.3.0 // indirect
	github.com/spf13/jwalterweatherman v1.1.0 // indirect
	github.com/spf13/pflag v1.0.5 // indirect
	github.com/spf13/viper v1.18.2 // indirect
	github.com/subosito/gotenv v1.6.0 // indirect
	github.com/tursodatabase/libsql-client-go v0.0.0-20240902231107-85af5b9d094d // indirect
	github.com/valyala/bytebufferpool v1.0.0 // indirect
	github.com/valyala/fasttemplate v1.2.2 // indirect
	github.com/vertica/vertica-sql-go v1.3.3 // indirect
	github.com/ydb-platform/ydb-go-genproto v0.0.0-20241112172322-ea1f63298f77 // indirect
	github.com/ydb-platform/ydb-go-sdk/v3 v3.95.3 // indirect
	github.com/ziutek/mymysql v1.5.4 // indirect
	go.opentelemetry.io/otel v1.29.0 // indirect
	go.opentelemetry.io/otel/trace v1.29.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/exp v0.0.0-20241210194714-1829a127f884 // indirect
	golang.org/x/net v0.33.0 // indirect
	golang.org/x/sync v0.11.0 // indirect
	golang.org/x/sys v0.28.0 // indirect
	golang.org/x/text v0.22.0 // indirect
	golang.org/x/time v0.8.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20241209162323-e6fa225c2576 // indirect
	google.golang.org/grpc v1.67.1 // indirect
	google.golang.org/protobuf v1.35.2 // indirect
	gopkg.in/ini.v1 v1.67.0 // indirect
	gopkg.in/yaml.v2 v2.4.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
	howett.net/plist v1.0.0 // indirect
	modernc.org/gc/v3 v3.0.0-20240107210532-573471604cb6 // indirect
	modernc.org/libc v1.55.3 // indirect
	modernc.org/mathutil v1.6.0 // indirect
	modernc.org/memory v1.8.0 // indirect
	modernc.org/sqlite v1.34.1 // indirect
	modernc.org/strutil v1.2.0 // indirect
	modernc.org/token v1.1.0 // indirect
)
